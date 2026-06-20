#!/usr/bin/env node

import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { processChatMessage } from './src/modules/chatbot/chatbot.service.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const sessionId = uuidv4();
let lat = 18.5204;
let lng = 73.8567;

console.log('\n----------------------------------------');
console.log('|    LocalConnect Chatbot - Terminal CLI  |');
console.log('-------------------------------------------\n');

console.log('Commands:');
console.log('  Type your message to search for products');
console.log('  /location <lat> <lng>  - Set your location (e.g., /location 28.6139 77.2090)');
console.log('  /clear                  - Clear chat history');
console.log('  /exit                   - Exit the chatbot\n');

const prompt = () => {
  rl.question('You: ', async (input) => {
    const trimmed = input.trim();

    if (trimmed === '/exit') {
      console.log('\nGoodbye!\n');
      rl.close();
      process.exit(0);
    }

    if (trimmed === '/clear') {
      console.log('Chat history cleared.\n');
      prompt();
      return;
    }

    if (trimmed.startsWith('/location')) {
      const parts = trimmed.split(' ');
      if (parts.length === 3) {
        const newLat = parseFloat(parts[1]);
        const newLng = parseFloat(parts[2]);
        if (!isNaN(newLat) && !isNaN(newLng)) {
          lat = newLat;
          lng = newLng;
          console.log(`Location updated to: ${lat}, ${lng}\n`);
        } else {
          console.log('Invalid coordinates. Use: /location <latitude> <longitude>\n');
        }
      } else {
        console.log('Usage: /location <latitude> <longitude>\n');
      }
      prompt();
      return;
    }

    if (!trimmed) {
      prompt();
      return;
    }

    try {
      console.log('\n⏳ Thinking...\n');
      const response = await processChatMessage({
        message: trimmed,
        sessionId,
        lat,
        lng,
      });

      console.log('\n----------------------------------------');
      console.log('Assistant:', response.reply, '\n');

      if (response.products && response.products.length > 0) {
        console.log('📦 Products found:\n');
        response.products.forEach((product, idx) => {
          console.log(`${idx + 1}. ${product.brand} ${product.model_name}`);
          console.log(`   Category: ${product.category}`);
          console.log(`   Price: ₹${product.seller_price}`);
          console.log(`   Shop: ${product.shop_name}`);
          console.log(`   Distance: ${product.distance_km.toFixed(2)}km`);
          console.log(`   Match Score: ${(product.similarity_score * 100).toFixed(1)}%\n`);
        });
      } else {
        console.log('(No products returned)\n');
      }

      prompt();
    } catch (err) {
      console.error('\nError:', err.message, '\n');
      prompt();
    }
  });
};

prompt();