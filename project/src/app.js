import express from 'express';
import cors from 'cors';
import chatbotRoutes from './modules/chatbot/chatbot.routes.js';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/chatbot', chatbotRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
