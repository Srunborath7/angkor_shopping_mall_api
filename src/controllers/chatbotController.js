const chatbotService = require('../services/chatbotService');
const { successResponse, errorResponse } = require('../utils/response');
const axios = require('axios');

class ChatbotController {
    /**
     * POST /api/chatbot/message
     * Accepts: { message, context: { page, productId, categoryId } }
     */
    async sendMessage(req, res) {
        try {
            const { message, context } = req.body;
            const userId = req.user?.id || null;

            if (!message || typeof message !== 'string' || !message.trim()) {
                return errorResponse(res, 'Message text is required', 400);
            }

            const replyData = await chatbotService.processMessage(message, {
                userId,
                context: context || {}
            });

            return successResponse(res, 'Chat response generated successfully', replyData);
        } catch (error) {
            console.error('[ChatbotController] sendMessage error:', error);
            return errorResponse(res, 'Failed to process chat message', 500);
        }
    }

    /**
     * GET /api/chatbot/prompts
     * Returns smart dynamic suggested prompts
     */
    async getPrompts(req, res) {
        try {
            const prompts = await chatbotService.getQuickPrompts();
            return successResponse(res, 'Quick prompts fetched successfully', prompts);
        } catch (error) {
            console.error('[ChatbotController] getPrompts error:', error);
            return errorResponse(res, 'Failed to fetch quick prompts', 500);
        }
    }

    /**
     * GET /api/chatbot/tts
     * Universal audio stream for Khmer (km) and English (en) text-to-speech
     */
    async streamTTS(req, res) {
        try {
            const { text, lang = 'km', q } = req.query;
            const queryText = text || q;

            if (!queryText) {
                return res.status(400).send('Text parameter is required');
            }

            const cleanText = String(queryText).slice(0, 300);
            const encoded = encodeURIComponent(cleanText);
            const targetLang = lang === 'en' ? 'en' : 'km';
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${targetLang}&client=tw-ob&q=${encoded}`;

            const audioRes = await axios.get(url, {
                responseType: 'stream',
                headers: {
                    'Referer': 'https://translate.google.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000
            });

            res.set({
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            });

            audioRes.data.pipe(res);
        } catch (err) {
            console.error('[ChatbotController] TTS proxy error:', err.message);
            res.status(500).send('TTS generation failed');
        }
    }
}

module.exports = new ChatbotController();
