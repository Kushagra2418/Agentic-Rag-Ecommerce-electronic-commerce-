import { processChatMessage } from './chatbot.service.js';
import ApiResponse from '../../utils/api-response.js';
import ApiError from '../../utils/api-error.js';

const handleChatMessage = async (req, res) => {
  const { message, sessionId, lat, lng } = req.body;

  if (!message || !sessionId) {
    throw new ApiError(400, 'message and sessionId are required');
  }

  const result = await processChatMessage({
    message,
    sessionId,
    lat: lat || 0,
    lng: lng || 0,
  });

  return res.status(200).json(
    new ApiResponse(200, result, 'Chat response generated')
  );
};

export { handleChatMessage };
