import { useState, useEffect, useRef } from 'react';

const ChatbotWidget = ({ apiBase = '/api/chatbot' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your LocalMart assistant. Tell me what you\'re looking for and I\'ll find products near you!', products: [] },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [sessionId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        },
        () => {
          setLat(0);
          setLng(0);
        }
      );
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, lat, lng }),
      });

      const data = await res.json();
      const reply = data.data || data;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply.reply || 'Sorry, something went wrong.',
          products: reply.products || [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I couldn\'t connect to the server. Please try again.',
          products: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 z-50"
        aria-label="Toggle chat"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[360px] h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 border border-gray-200">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">AI</div>
              <span className="font-semibold text-sm">LocalMart Assistant</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="flex items-end gap-2 max-w-[85%]">
                    {msg.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs shrink-0 mb-1">AI</div>
                    )}
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>

                {/* Product Cards */}
                {msg.products && msg.products.length > 0 && (
                  <div className="mt-2 ml-8 space-y-2">
                    {msg.products.map((product) => (
                      <a
                        key={product.seller_product_id}
                        href={`/product/${product.seller_product_id}`}
                        className="block bg-white border border-gray-200 rounded-lg p-2 hover:shadow-md transition-shadow"
                      >
                        <div className="flex gap-2">
                          {product.image_url && (
                            <img
                              src={product.image_url}
                              alt={product.model_name}
                              className="w-12 h-12 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate">
                              {product.brand} {product.model_name}
                            </p>
                            <p className="text-xs text-blue-600 font-medium">
                              ₹{product.seller_price}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {product.shop_name} · {product.distance_km?.toFixed(1)}km
                            </p>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-end gap-2">
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs shrink-0 mb-1">AI</div>
                  <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="border-t border-gray-200 px-3 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about products..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputText.trim()}
                className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                aria-label="Send message"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;
