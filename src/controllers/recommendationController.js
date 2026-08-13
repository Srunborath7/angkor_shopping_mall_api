/**
 * recommendationController.js
 *
 * Handles recommendation endpoints:
 *   GET  /api/recommendations           – personalised (auth required)
 *   POST /api/recommendations/track      – track interaction (view/search/cart/order)
 *   POST /api/recommendations/train      – trigger ML model training
 *   GET  /api/recommendations/popular   – trending products (public)
 *   GET  /api/recommendations/search    – keyword-based suggestions (public/optionalAuth)
 *   GET  /api/recommendations/similar/:productId – similar products (public)
 */

const {
    getMLRecommendations,
    getPopularProducts,
    getSimilarProducts,
    getSearchSuggestions,
    triggerMLTraining,
} = require('../services/recommendationService');

const { trackInteraction, trackInteractionBulk } = require('../utils/trackInteraction');
const { successResponse, errorResponse } = require('../utils/response');

// ─────────────────────────────────────────────
// GET /api/recommendations
// ─────────────────────────────────────────────
async function getRecommendations(req, res) {
    try {
        const userId = req.user.id;
        const limit  = Math.min(parseInt(req.query.limit) || 10, 50);

        const result = await getMLRecommendations(userId, limit);

        if (!result.products || !result.products.length) {
            const popular = await getPopularProducts(limit);
            return successResponse(res, 'Showing popular products (personalised model warming up)', {
                source:   'popular',
                products: popular,
            });
        }

        return successResponse(res, 'Personalised recommendations fetched successfully', {
            source:         result.source,
            user_interests: result.user_interests || {},
            products:       result.products,
        });
    } catch (error) {
        console.error('[recommendationController] getRecommendations:', error.message);
        return errorResponse(res, 'Failed to fetch recommendations', 500);
    }
}

// ─────────────────────────────────────────────
// POST /api/recommendations/track
// Explicit frontend interaction tracker for view/search/cart/order
// ─────────────────────────────────────────────
async function trackUserInteraction(req, res) {
    try {
        const userId = req.user?.id || null;
        const { productId, productIds, type = 'view' } = req.body;

        if (!userId) {
            return errorResponse(res, 'Authentication required to track personalized interaction', 401);
        }

        if (Array.isArray(productIds) && productIds.length > 0) {
            await trackInteractionBulk(userId, productIds, type);
            return successResponse(res, `Bulk interaction '${type}' tracked successfully for ${productIds.length} products`);
        }

        if (!productId) {
            return errorResponse(res, 'productId or productIds array is required', 400);
        }

        await trackInteraction(userId, productId, type);
        return successResponse(res, `Interaction '${type}' tracked successfully for product ${productId}`);
    } catch (error) {
        console.error('[recommendationController] trackUserInteraction:', error.message);
        return errorResponse(res, 'Failed to track user interaction', 500);
    }
}

// ─────────────────────────────────────────────
// POST /api/recommendations/train
// Trigger re-training of ML model
// ─────────────────────────────────────────────
async function triggerTrain(req, res) {
    try {
        const trainResult = await triggerMLTraining();
        if (!trainResult.success) {
            return errorResponse(res, trainResult.message || 'Training failed', 500);
        }

        return successResponse(res, 'Recommendation ML model re-trained successfully', trainResult.data);
    } catch (error) {
        console.error('[recommendationController] triggerTrain:', error.message);
        return errorResponse(res, 'Failed to trigger recommendation training', 500);
    }
}

// ─────────────────────────────────────────────
// GET /api/recommendations/popular
// ─────────────────────────────────────────────
async function getPopular(req, res) {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const products = await getPopularProducts(limit);

        return successResponse(res, 'Popular products fetched successfully', {
            source: 'popular',
            products,
        });
    } catch (error) {
        console.error('[recommendationController] getPopular:', error.message);
        return errorResponse(res, 'Failed to fetch popular products', 500);
    }
}

// ─────────────────────────────────────────────
// GET /api/recommendations/search?q=keyword
// ─────────────────────────────────────────────
async function getSearchRecommendations(req, res) {
    try {
        const query  = req.query.q || req.query.query || '';
        const limit  = Math.min(parseInt(req.query.limit) || 10, 50);
        const userId = req.user?.id || null;

        if (!query.trim()) {
            return errorResponse(res, 'Search query (q) is required', 400);
        }

        const suggestions = await getSearchSuggestions(query, limit, userId);

        return successResponse(res, 'Search suggestions fetched successfully', suggestions);
    } catch (error) {
        console.error('[recommendationController] getSearchRecommendations:', error.message);
        return errorResponse(res, 'Failed to fetch search suggestions', 500);
    }
}

// ─────────────────────────────────────────────
// GET /api/recommendations/similar/:productId
// ─────────────────────────────────────────────
async function getSimilar(req, res) {
    try {
        const { productId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 8, 50);

        if (!productId) {
            return errorResponse(res, 'productId param is required', 400);
        }

        const products = await getSimilarProducts(productId, limit);

        return successResponse(res, 'Similar products fetched successfully', {
            source:   'similar',
            products,
        });
    } catch (error) {
        console.error('[recommendationController] getSimilar:', error.message);
        return errorResponse(res, 'Failed to fetch similar products', 500);
    }
}

module.exports = {
    getRecommendations,
    trackUserInteraction,
    triggerTrain,
    getPopular,
    getSearchRecommendations,
    getSimilar,
};