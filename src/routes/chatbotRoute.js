const express = require('express');
const router = express.Router();
const optionalAuth = require('../middlewares/optionalAuth');
const chatbotController = require('../controllers/chatbotController');

/**
 * POST /api/chatbot/message
 * Handles conversational queries with optional authentication for personalized context (orders, wishlist, etc.)
 */
router.post('/message', optionalAuth, chatbotController.sendMessage);

/**
 * GET /api/chatbot/prompts
 * Returns dynamic quick prompts
 */
router.get('/prompts', optionalAuth, chatbotController.getPrompts);

/**
 * GET /api/chatbot/tts
 * Universal Khmer & English TTS streaming proxy
 */
router.get('/tts', chatbotController.streamTTS);

module.exports = router;
