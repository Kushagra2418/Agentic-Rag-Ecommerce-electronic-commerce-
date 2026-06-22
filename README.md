📖 Overview

LocalConnect is a hyperlocal electronics marketplace where multiple nearby sellers list the same products at different prices — and an agentic RAG system sits
on top to help shoppers find exactly what they need without manually scrolling through hundreds of listings.

Instead of rigid keyword search, users can ask natural questions like:


"Find me a gaming laptop under ₹70,000 with at least 16GB RAM"
"Which seller near Kothrud has the cheapest 1-ton AC in stock?"
"Compare the Galaxy S24 and iPhone 15 for camera quality"



A LangGraph.js agent orchestrates the conversation, calling a hybrid search tool that blends semantic vector similarity with structured SQL filters, then hands the retrieved, grounded context to Groq's Llama 3.3 70B to generate a fast, accurate response — instead of hallucinating specs or prices.


✨ Key Features


🔎 Hybrid Semantic + Structured Search — Combines pgvector similarity search over product embeddings with precise SQL filters (price, brand, category) for results that are both relevant and accurate.
🧩 Stateful Agent Orchestration — Built with LangGraph.js, the agent can decide to search, refine, compare, or ask a clarifying question before answering — not just a single prompt → response call.
⚡ Ultra-Fast Inference — Powered by Groq's LPU inference engine running Llama 3.3 70B, giving near-instant responses even for multi-step agent reasoning.
💰 Multi-Seller Price Comparison — Every product can be listed by several sellers; the agent surfaces the best price, stock availability, and warranty terms automatically.
📍 Location-Aware Discovery — Seller profiles store latitude/longitude and a Google Place ID, letting the agent rank results by proximity to the buyer.
💬 Conversational Memory — Conversation history is tracked as a message array, so the agent maintains context turn-to-turn (e.g. "compare that with the OnePlus 12").
⭐ Reviews & Ratings — Aggregated ratings roll up to both products and seller profiles, factored into agent recommendations.
📈 Price History & Demand Tracking — Historical price changes and per-city view/wishlist counts feed signals like "price dropped" or "trending in your city" into agent responses.
🔔 Notifications & Wishlist — Users get notified on price drops or restocks for wishlisted items.



🧠 How the Agentic RAG Pipeline Works

                    User Query (natural language)
                              │
                              ▼
                ┌──────────────────────────────┐
                │      LangGraph.js Agent        │
                │  (stateful graph + memory)      │
                │  conversation history: Message[] │
                └───────────────┬──────────────────┘
                                │
                  decides to call search tool
                                │
                                ▼
                ┌──────────────────────────────┐
                │   chatbot_search_products()    │
                │      Hybrid Search Tool         │
                ├───────────────┬──────────────────┤
                │  Vector Search │  Structured Search │
                │   (pgvector)   │   (SQL filters)     │
                │                │                     │
                │ Query embedded │  category, price     │
                │ via            │  range, brand,       │
                │ all-MiniLM-L6  │  availability, city   │
                │ -v2 model      │                       │
                └───────────────┴──────────────────┘
                                │
                  ranked, grounded product context
                                │
                                ▼
                ┌──────────────────────────────┐
                │   Groq — Llama 3.3 70B          │
                │   Reasoning & response generation│
                └───────────────┬──────────────────┘
                                ▼
                      Grounded final answer
                 (real prices, sellers, specs — no hallucination)

The agent loop (via LangGraph.js) can route back to the search tool multiple times — e.g. broadening a query, applying a different filter, or fetching comparison data — before producing a final answer.

🏗️ Tech Stack

LayerTechnologyLLMGroq — Llama 3.3 70B (LPU inference)Agent FrameworkLangGraph.jsMemoryConversation history array (per-session message state)Vector Searchpgvector extension on PostgreSQLEmbedding Modelall-MiniLM-L6-v2 (sentence-transformers, 384-dim)Structured Searchchatbot_search_products() — custom Postgres search functionSearch StrategyHybrid (vector similarity + SQL structured filters)BackendNode.js + ExpressDB Connector / ORMPrismaDatabasePostgreSQLFrontendAdd your framework here (e.g. Next.js / React)HostingAdd your deployment target here

✏️ Replace the remaining placeholders (frontend, hosting) before publishing.

🗂️ Database Schema Highlights

The schema (managed via Prisma) models a full local-marketplace domain, extended with vector search support:

ModelPurposeusers / roles / user_rolesAuth, role-based access (buyer/seller/admin)seller_profilesSeller shop details, geo-coordinates, verification statusproductsCanonical product catalog (brand, model, category, specs) — also holds embeddings for vector searchseller_productsPer-seller pricing, stock, warranty for each productproduct_price_historyHistorical price tracking per seller listingproduct_demandCity-level views & wishlist counts for trend signalsreviews / review_targets / review_mediaRatings & reviews on products and sellerswishlist_itemsSaved products per usernotificationsPrice-drop / restock alertsexternal_market_pricesReference pricing from external platforms for comparison

chatbot_search_products()

A Postgres function that powers hybrid retrieval — combining a pgvector cosine-similarity search over all-MiniLM-L6-v2 embeddings of product descriptions with structured WHERE clauses (category, price range, city, availability), returning a single ranked result set to the agent.
