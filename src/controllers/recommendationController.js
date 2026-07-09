const recommendationService = require('../services/recommendationService');
const { successResponse, errorResponse } = require('../utils/response');

class RecommendationController {
    async getRecommendations(req, res) {
        try {
            const userId = req.user.id;
            const recommendations = await recommendationService.getRecommendations(userId);
            return successResponse(res, 'Personalized recommendations retrieved successfully', recommendations);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new RecommendationController();
