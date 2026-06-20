import { Router } from 'express';
import { handleChatMessage } from './chatbot.controller.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.post('/message', asyncHandler(handleChatMessage));

export default router;
