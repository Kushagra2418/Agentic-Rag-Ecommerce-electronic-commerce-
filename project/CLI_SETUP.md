# LocalMart Chatbot - Terminal CLI Setup

Run the chatbot locally in your terminal without needing the web interface.

## Prerequisites

1. **PostgreSQL running** (local or remote)
2. **API Keys** set in `.env`:
   - `GROQ_API_KEY` - Get from https://console.groq.com
   - `HUGGINGFACE_API_KEY` - Get from https://huggingface.co/settings/tokens

3. **Database set up** with:
   - pgvector extension enabled
   - All migrations applied (schema, tables, stored procedures)
   - Sample products data

## Setup Steps

### 1. Update `.env` with your database connection

If using **Supabase PostgreSQL** (current):
```
DATABASE_URL=postgresql://postgres:[YOUR-DB-PASSWORD]@db.mmezsuwmyjtsbuapmmfz.supabase.co:5432/postgres
```

If using **local PostgreSQL**:
```
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/localmart
```

If using **remote PostgreSQL**:
```
DATABASE_URL=postgresql://postgres:your_password@your-server-ip:5432/localmart
```

### 2. Add API Keys

Edit `.env`:
```
GROQ_API_KEY=gsk_your_actual_key_here
HUGGINGFACE_API_KEY=hf_your_actual_key_here
```

### 3. Run the CLI

```bash
npm run cli
```

## Usage in Terminal

### Basic Commands

```
You: smartphone under 30000
Assistant: [Response with products]

You: /location 28.6139 77.2090
Assistant: Location updated to: 28.6139, 77.209

You: phones near me
Assistant: [Search results for your location]

You: /clear
Chat history cleared.

You: /exit
Goodbye!
```

### Available Commands

- **Type any message** - Search for products
- **/location <lat> <lng>** - Set your GPS coordinates (default: 0, 0)
- **/clear** - Clear conversation history
- **/exit** - Exit the chatbot

## How It Works

1. You type a message
2. LangGraph agent:
   - **extractParams** node: Extracts product query, budget, category, radius
   - **searchDB** node: Generates embedding via HuggingFace, searches via pgvector + SQL
   - **generateReply** node: Groq LLM generates friendly response
3. Products + message displayed in terminal
4. Conversation history stored in memory (last 6 messages)

## Example Interaction

```
You: I need a laptop
Assistant: I found some great laptops for you! Here are the options...

📦 Products found:

1. Dell XPS 15
   Category: Laptops
   Price: ₹1,25,000
   Shop: TechHub Electronics
   Distance: 2.45km
   Match Score: 95.3%

2. Apple MacBook Air M2
   Category: Laptops
   Price: ₹1,15,000
   Shop: Apple Store Mumbai
   Distance: 5.12km
   Match Score: 92.8%
```

## Troubleshooting

### Error: "Cannot connect to database"
- Check `DATABASE_URL` in `.env`
- Verify PostgreSQL is running
- Test connection: `psql YOUR_DATABASE_URL`

### Error: "HuggingFace API failed"
- Check `HUGGINGFACE_API_KEY` is valid
- Verify token has API access at https://huggingface.co/settings/tokens

### Error: "Groq API failed"
- Check `GROQ_API_KEY` is valid
- Verify API key has access at https://console.groq.com

### No products returned
- Make sure sample data is loaded in the database
- Verify `description_embedding` column has vector data
- Check location is set to a valid coordinate

## Next Steps

Once CLI works, you can:
1. Deploy to a web server with the Express backend
2. Connect the React frontend
3. Add more products and sellers
4. Customize the Groq model parameters
