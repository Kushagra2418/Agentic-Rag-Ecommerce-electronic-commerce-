import ChatbotWidget from './components/ChatbotWidget.jsx';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">LocalMart</h1>
        <p className="text-gray-600">Your local shopping assistant.</p>
      </div>
      <ChatbotWidget />
    </div>
  );
}

export default App;
