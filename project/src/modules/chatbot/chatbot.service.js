import { StateGraph, END } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';
import prisma from '../../config/prisma.js';
import { GROQ_API_KEY, HUGGINGFACE_API_KEY } from '../../config/env.js';

const conversationStore = new Map();
const sessionDataStore  = new Map();

// ─────────────────────────────────────────────────────
// Embedding
// ─────────────────────────────────────────────────────
const generateEmbedding = async (text) => {
  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok) throw new Error(`HF error: ${response.status}`);
    const data = await response.json();
    const vec = Array.isArray(data[0]) ? data[0] : data;
    if (!Array.isArray(vec) || vec.length !== 384) throw new Error('Bad shape');
    return vec;
  } catch (err) {
    console.log('[DEBUG] Embedding failed:', err.message, '→ using zero vector (text-only mode)');
    return new Array(384).fill(0);
  }
};

// ─────────────────────────────────────────────────────
// DB Search
// ─────────────────────────────────────────────────────
const searchProductsHybrid = async (query, embedding, lat, lng, radius = 50) => {
  const embeddingStr = `[${embedding.join(',')}]`;
  const safeQuery = query.replace(/'/g, "''");
  const sql = `SELECT * FROM chatbot_search_products('${safeQuery}', '${embeddingStr}'::vector, ${lat}::float8, ${lng}::float8, ${radius}::float8)`;
  console.log('[DEBUG] SQL query:', query);
  console.log('[DEBUG] Location:', lat, lng, '| Radius:', radius, 'km');
  const results = await prisma.$queryRawUnsafe(sql);
  console.log('[DEBUG] Results count:', results.length);
  return results.map((row) => ({
    seller_product_id: Number(row.seller_product_id),
    product_id:        Number(row.product_id),
    brand:             row.brand,
    model_name:        row.model_name,
    category:          row.category,
    description:       row.description,
    seller_price:      parseFloat(row.seller_price),
    distance_km:       parseFloat(row.distance_km),
    shop_name:         row.shop_name,
    image_url:         row.image_url,
    similarity_score:  parseFloat(row.similarity_score),
  }));
};

// ─────────────────────────────────────────────────────
// Groq
// ─────────────────────────────────────────────────────
const callGroq = async (messages, maxTokens = 800) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`Groq failed: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
};

// ─────────────────────────────────────────────────────
// Guided questions
// ─────────────────────────────────────────────────────
const QUESTIONS = [
  {
    key: 'usage',
    ask: (product) =>
      `Great choice! Just a couple of quick questions to help me find the best ${product} for you.\n\nFirst — who will be using it and what for? (e.g. college student, gaming, office work, watching videos)`,
  },
  {
    key: 'budget',
    ask: () =>
      `Got it! What is your budget? You can say something like "under ₹30,000" or "around ₹50,000".`,
  },
  {
    key: 'preference',
    ask: (product) =>
      `Almost there! Any specific brand or feature you want in a ${product}? (Say "no preference" if unsure)`,
  },
];

// ─────────────────────────────────────────────────────
// Detect product category
// ─────────────────────────────────────────────────────
const detectProduct = (msg) => {
  const m = msg.toLowerCase();
  if (m.match(/gaming laptop|gaming notebook/))          return 'gaming laptop';
  if (m.match(/laptop|notebook|macbook/))                return 'laptop';
  if (m.match(/phone|mobile|smartphone|iphone|android/)) return 'smartphone';
  if (m.match(/earbuds|tws|airpods/))                    return 'earbuds';
  if (m.match(/headphone|headset/))                      return 'headphones';
  if (m.match(/watch|smartwatch/))                       return 'smartwatch';
  if (m.match(/tablet|ipad/))                            return 'tablet';
  if (m.match(/\bfan\b|ceiling fan/))                    return 'ceiling_fan';
  if (m.match(/\btv\b|television/))                      return 'television';
  if (m.match(/fridge|refrigerator/))                    return 'refrigerator';
  if (m.match(/washing machine|washer/))                 return 'washing_machine';
  if (m.match(/camera|dslr|mirrorless/))                 return 'camera';
  if (m.match(/speaker|bluetooth speaker/))              return 'speaker';
  if (m.match(/\bac\b|air conditioner/))                 return 'air_conditioner';
  return null;
};

// ─────────────────────────────────────────────────────
// Extract brand — smart detection, avoids false positives
// "noise cancellation" → NOT Noise brand
// "noise smartwatch"   → IS Noise brand  
// ─────────────────────────────────────────────────────
const extractBrand = (msg) => {
  if (!msg) return null;
  const m = msg.toLowerCase().trim();

  // Skip obvious non-brand phrases
  const featurePhrases = [
    'noise cancellation', 'noise cancelling', 'noise cancel',
    'active noise', 'no noise', 'noise reduction',
  ];
  for (const phrase of featurePhrases) {
    if (m.includes(phrase)) {
      // Remove the phrase and check if a brand remains
      const cleaned = m.replace(phrase, '').trim();
      if (!cleaned) return null; // only had the phrase, no brand
    }
  }

  // Ambiguous single words that are BOTH brands and common words
  // Only treat as brand when used ALONE or with product keywords
  const ambiguous = {
    'noise': /\bnoise\b(?!\s+(cancell|cancel|reduc|free|level))/,
    'mi':    /\bmi\b(?!\s*x|\s*[0-9])/,  // "mi" alone, not "mix" or "mi6"
  };

  // Standard brand list — unambiguous ones matched with word boundary
  const clearBrands = [
    'asus','hp','dell','lenovo','acer','apple','samsung','sony',
    'oneplus','realme','motorola','redmi','xiaomi','poco','lg',
    'boat','jbl','bose','nothing','iqoo','vivo','amazfit',
    'garmin','whirlpool','ifb','daikin','canon','nikon',
    'usha','havells','crompton','orient','atomberg',
  ];

  for (const b of clearBrands) {
    const re = new RegExp(`\\b${b}\\b`, 'i');
    if (re.test(m)) return b;
  }

  // Check ambiguous brands only with their safe patterns
  for (const [brand, pattern] of Object.entries(ambiguous)) {
    if (pattern.test(m)) return brand;
  }

  return null;
};

// ─────────────────────────────────────────────────────
// Extract budget from any message
// ─────────────────────────────────────────────────────
const extractBudget = (msg) => {
  if (!msg) return null;
  const m = msg.toLowerCase();
  const patterns = [
    /under\s*[₹rs.]*\s*(\d[\d,]*)/i,
    /around\s*[₹rs.]*\s*(\d[\d,]*)/i,
    /budget\s*[₹rs.]*\s*(\d[\d,]*)/i,
    /upto?\s*[₹rs.]*\s*(\d[\d,]*)/i,
    /max\s*[₹rs.]*\s*(\d[\d,]*)/i,
    /increase.*?(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:budget|rs|₹|rupees)/i,
    /^(\d{4,6})$/,
  ];
  for (const pat of patterns) {
    const match = m.match(pat);
    if (match) {
      let num = parseInt(match[1].replace(/,/g, ''));
      if (num > 0 && num < 1000) num *= 1000;
      if (num >= 1000) return `around ₹${num}`;
    }
  }
  return null;
};

// ─────────────────────────────────────────────────────
// Browse intent
// ─────────────────────────────────────────────────────
const detectBrowseIntent = (msg) => {
  const m = msg.toLowerCase();
  const hasBrand  = extractBrand(msg) !== null;
  const hasSpec   = /gaming|rtx|gtx|i5|i7|i9|ryzen|ssd|4k|oled|amoled|144hz|120hz|5g|anc|ram|bldc|noise cancel/.test(m);
  const hasBudget = /\d{4,}|under|below|budget|cheap|affordable|premium/.test(m);
  const hasIntent = /show|display|list|browse|see|give|find|search|available|options|all|tell me/.test(m);
  return (hasIntent && (hasBrand || hasSpec || hasBudget))
      || (hasBrand && hasSpec)
      || (hasBrand && hasBudget);
};

// ─────────────────────────────────────────────────────
// Build search query
// ─────────────────────────────────────────────────────
const buildSearchQuery = (product, answers) => {
  const { usage = '', budget = '', preference = '' } = answers;
  const parts = [product];

  // Budget
  const budgetNums = budget.match(/\d[\d,]*/g);
  if (budgetNums) {
    const max = Math.max(...budgetNums.map(n => parseInt(n.replace(/,/g, ''))));
    if (max >= 1000) parts.push(`under ${max}`);
  }

  // Usage keywords
  const usageKw = usage.match(/gaming|college|student|office|professional|video|coding|design|photography|music|work|business|travel|school/gi);
  if (usageKw) parts.push(...usageKw);

  // Brand from preference
  const brand = extractBrand(preference);
  if (brand) parts.push(brand);

  // Feature/spec keywords — deduplicated, no double RTX
  const specKw = preference.match(/\b(intel|amd|ryzen|snapdragon|rtx\s*\d*|gtx\s*\d*|nvidia|8gb|16gb|32gb|ssd|oled|amoled|anc|bldc|5g|4k|144hz|120hz|gaming|lightweight|thin|slim|battery|portable|noise cancell\w*)\b/gi);
  if (specKw) {
    specKw.forEach(kw => parts.push(kw.toLowerCase().trim()));
  }

  // If preference has no brand AND no spec keywords, add it raw (e.g. "rtx 3060")
  if (!brand && !specKw && preference.trim() && preference.trim() !== 'no preference') {
    parts.push(preference.trim().toLowerCase());
  }

  const query = [...new Set(parts.map(p => p.toLowerCase().trim()))].join(' ');
  console.log('[DEBUG] Search query built:', query);
  return query;
};

// ─────────────────────────────────────────────────────
// Missing questions checker
// ─────────────────────────────────────────────────────
const getMissingKeys = (answers) =>
  QUESTIONS.filter(q => !answers[q.key] || answers[q.key].trim() === '').map(q => q.key);

// ─────────────────────────────────────────────────────
// LangGraph state
// ─────────────────────────────────────────────────────
const ChatState = Annotation.Root({
  messages:      Annotation({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  sessionId:     Annotation({ default: () => '' }),
  userMessage:   Annotation({ default: () => '' }),
  lat:           Annotation({ default: () => 18.5204 }),
  lng:           Annotation({ default: () => 73.8567 }),
  searchResults: Annotation({ default: () => [] }),
  reply:         Annotation({ default: () => '' }),
  shouldSearch:  Annotation({ default: () => false }),
  searchQuery:   Annotation({ default: () => '' }),
});

// ═══════════════════════════════════════════════════════
// NODE 1 — decideNode
// ═══════════════════════════════════════════════════════
const decideNode = async (state) => {
  const { sessionId, userMessage } = state;

  if (!sessionDataStore.has(sessionId)) {
    sessionDataStore.set(sessionId, {
      phase: 'new', product: null,
      questionIndex: 0, answers: {}, pendingQuestions: [],
    });
  }

  const session = sessionDataStore.get(sessionId);
  console.log('[DEBUG] Phase:', session.phase, '| Product:', session.product);

  // ── new ─────────────────────────────────────────────
  if (session.phase === 'new') {
    const product = detectProduct(userMessage);
    if (!product) {
      return {
        ...state, shouldSearch: false,
        reply: `Hello! Welcome to LocalConnect 😊\n\nWhat are you looking for today? (e.g. laptop, phone, earbuds, TV, ceiling fan...)`,
      };
    }
    if (detectBrowseIntent(userMessage)) {
      const brand  = extractBrand(userMessage);
      const budget = extractBudget(userMessage);
      const answers = { usage: 'general use', budget: budget || '', preference: brand || '' };
      Object.assign(session, { product, answers, phase: 'done' });
      sessionDataStore.set(sessionId, session);
      return { ...state, shouldSearch: true, searchQuery: buildSearchQuery(product, answers) };
    }
    Object.assign(session, { product, phase: 'asking', questionIndex: 0, answers: {} });
    sessionDataStore.set(sessionId, session);
    return { ...state, shouldSearch: false, reply: QUESTIONS[0].ask(product) };
  }

  // ── asking ──────────────────────────────────────────
  if (session.phase === 'asking') {
    const q = QUESTIONS[session.questionIndex];
    session.answers[q.key] = userMessage;
    session.questionIndex++;
    sessionDataStore.set(sessionId, session);
    if (session.questionIndex < QUESTIONS.length) {
      return { ...state, shouldSearch: false, reply: QUESTIONS[session.questionIndex].ask(session.product) };
    }
    session.phase = 'done';
    sessionDataStore.set(sessionId, session);
    return { ...state, shouldSearch: true, searchQuery: buildSearchQuery(session.product, session.answers) };
  }

  // ── asking_partial ───────────────────────────────────
  if (session.phase === 'asking_partial') {
    const pending = session.pendingQuestions || [];
    if (pending.length > 0) {
      const key = pending[0];
      session.answers[key] = userMessage;
      pending.shift();
      session.pendingQuestions = pending;
      sessionDataStore.set(sessionId, session);
      if (pending.length > 0) {
        const nextQ = QUESTIONS.find(q => q.key === pending[0]);
        return { ...state, shouldSearch: false, reply: nextQ.ask(session.product) };
      }
      session.phase = 'done';
      sessionDataStore.set(sessionId, session);
      return { ...state, shouldSearch: true, searchQuery: buildSearchQuery(session.product, session.answers) };
    }
  }

  // ── done ─────────────────────────────────────────────
  if (session.phase === 'done') {

    const newProduct = detectProduct(userMessage);
    const newBrand   = extractBrand(userMessage);
    const newBudget  = extractBudget(userMessage);
    const isSameProduct = !newProduct || newProduct === session.product;

    // ① Refinement on same product (brand/budget/feature change)
    if (isSameProduct && (newBrand || newBudget)) {
      console.log('[DEBUG] Refinement — brand:', newBrand, '| budget:', newBudget);
      if (newBudget) session.answers.budget     = newBudget;
      if (newBrand)  session.answers.preference = newBrand;
      // Feature keyword (only when no brand change)
      if (!newBrand) {
        const feat = userMessage.match(/\b(gaming|lightweight|thin|slim|battery|camera|portable|noise cancell\w*|anc|bldc|5g|oled|amoled|rtx[\s\d]*|gtx[\s\d]*)\b/i);
        if (feat) session.answers.preference = ((session.answers.preference || '') + ' ' + feat[1]).trim();
      }
      sessionDataStore.set(sessionId, session);
      return { ...state, shouldSearch: true, searchQuery: buildSearchQuery(session.product, session.answers) };
    }

    // Feature-only refinement (no brand, no budget, no new product)
    if (isSameProduct && !newBrand && !newBudget) {
      const feat = userMessage.match(/\b(gaming|rtx[\s\d]*|gtx[\s\d]*|noise cancell\w*|anc|bldc|oled|amoled|5g|144hz|120hz|ssd|lightweight|thin|slim|battery|camera|portable)\b/i);
      if (feat) {
        console.log('[DEBUG] Feature refinement:', feat[1]);
        session.answers.preference = ((session.answers.preference || '') + ' ' + feat[1]).trim();
        sessionDataStore.set(sessionId, session);
        return { ...state, shouldSearch: true, searchQuery: buildSearchQuery(session.product, session.answers) };
      }
    }

    // ② New product + brand/budget/browse intent
    if (newProduct && (detectBrowseIntent(userMessage) || newBrand || newBudget)) {
      console.log('[DEBUG] New product browse:', newProduct);
      const answers = { usage: 'general use', budget: newBudget || '', preference: newBrand || '' };
      Object.assign(session, { product: newProduct, answers, phase: 'done' });
      sessionDataStore.set(sessionId, session);
      return { ...state, shouldSearch: true, searchQuery: buildSearchQuery(newProduct, answers) };
    }

    // ③ New product, no specifics → ask only missing
    if (newProduct && newProduct !== session.product) {
      const carried = { usage: session.answers.usage || '' };
      const missing = getMissingKeys(carried);
      if (missing.length === 0) {
        Object.assign(session, { product: newProduct, answers: { ...carried, budget: '', preference: '' }, phase: 'done' });
        sessionDataStore.set(sessionId, session);
        return { ...state, shouldSearch: true, searchQuery: buildSearchQuery(newProduct, session.answers) };
      }
      const firstQ = QUESTIONS.find(q => q.key === missing[0]);
      Object.assign(session, { product: newProduct, answers: carried, phase: 'asking_partial', pendingQuestions: missing });
      sessionDataStore.set(sessionId, session);
      return { ...state, shouldSearch: false, reply: firstQ.ask(newProduct) };
    }

    // ④ Pure follow-up
    return { ...state, shouldSearch: false, reply: '__followup__' };
  }

  return { ...state, shouldSearch: false, reply: '__followup__' };
};

// ═══════════════════════════════════════════════════════
// NODE 2 — searchNode
// ═══════════════════════════════════════════════════════
const searchNode = async (state) => {
  if (!state.shouldSearch || !state.searchQuery) return { ...state, searchResults: [] };
  try {
    const embedding = await generateEmbedding(state.searchQuery);
    const results   = await searchProductsHybrid(state.searchQuery, embedding, state.lat, state.lng, 50);
    return { ...state, searchResults: results };
  } catch (err) {
    console.error('[DEBUG] Search error:', err.message);
    return { ...state, searchResults: [] };
  }
};

// ═══════════════════════════════════════════════════════
// NODE 3 — replyNode
// ═══════════════════════════════════════════════════════
const replyNode = async (state) => {
  const { sessionId, userMessage, messages, reply, shouldSearch, searchResults, searchQuery } = state;
  const session = sessionDataStore.get(sessionId) || {};

  if (!shouldSearch && reply !== '__followup__') {
    return {
      ...state,
      messages: [...messages,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ],
    };
  }

  if (reply === '__followup__') {
    const groqReply = await callGroq([
      {
        role: 'system',
        content: `You are a helpful local electronics shopkeeper at LocalConnect.
The customer already received product recommendations.
- Only compare or explain products already shown
- NEVER invent product names, models or prices
- If they want different budget/brand say: "Just tell me your budget or brand and I'll search again!"`,
      },
      ...messages.slice(-8),
      { role: 'user', content: userMessage },
    ], 400);
    return {
      ...state,
      messages: [...messages,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: groqReply },
      ],
    };
  }

  const { usage, budget, preference } = session.answers || {};
  const resultsContext = searchResults.length > 0
    ? `PRODUCTS AVAILABLE NEARBY (ONLY recommend from this exact list):\n` +
      searchResults.map((p, i) =>
        `${i + 1}. ${p.brand} ${p.model_name} — ₹${p.seller_price.toLocaleString('en-IN')} at ${p.shop_name} (${p.distance_km.toFixed(1)}km)\n   ${p.description}`
      ).join('\n\n')
    : `NO PRODUCTS FOUND for "${searchQuery}".`;

  const systemPrompt = `You are a warm local shopkeeper at LocalConnect.

Customer wants: ${session.product}
Use case: ${usage || 'not specified'}
Budget: ${budget || 'not specified'}
Brand/Feature preference: ${preference || 'none'}

${resultsContext}

${searchResults.length > 0 ? `
TASK:
- Recommend best 1-3 products FROM THE LIST ONLY
- Explain in simple friendly language why each suits their needs
- Mention shop name and distance
- 2-3 sentences per product max
- End with: "Want to refine? Just say your budget or preferred brand and I'll search again! "

STRICT RULES:
- If customer asked for specific brand, ONLY mention that brand's products from the list
- NEVER mention products not in the list
- NEVER invent prices, models or specs not in the list
` : `
TASK:
- Be honest — nothing matched nearby
- DO NOT invent any product
- Suggest: "try saying show me [brand] instead" or "increase budget to X"
`}`;

  const groqReply = await callGroq([
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: 'Show me what you found.' },
  ], 800);

  return {
    ...state,
    messages: [...messages,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: groqReply },
    ],
    searchResults,
  };
};

const buildChatAgent = () =>
  new StateGraph(ChatState)
    .addNode('decide',    decideNode)
    .addNode('search',    searchNode)
    .addNode('replyNode', replyNode)
    .addEdge('__start__', 'decide')
    .addEdge('decide',    'search')
    .addEdge('search',    'replyNode')
    .addEdge('replyNode', END)
    .compile();

const processChatMessage = async ({ message, sessionId, lat, lng }) => {
  if (!conversationStore.has(sessionId)) conversationStore.set(sessionId, []);
  const messages = conversationStore.get(sessionId);
  const agent    = buildChatAgent();
  const result   = await agent.invoke({ messages, sessionId, userMessage: message, lat, lng });
  conversationStore.set(sessionId, result.messages.slice(-12));
  const lastReply = result.messages.filter(m => m.role === 'assistant').at(-1)?.content
    || 'Sorry, something went wrong.';
  return { reply: lastReply, products: result.searchResults || [] };
};

export { processChatMessage, generateEmbedding, searchProductsHybrid };