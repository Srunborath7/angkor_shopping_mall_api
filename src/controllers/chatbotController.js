const chatbotService = require('../services/chatbotService');
const { successResponse, errorResponse } = require('../utils/response');

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
}

module.exports = new ChatbotController();
