/**
 * recommendationController.js
 *
 * Handles 4 recommendation endpoints:
 *   GET /api/recommendations           – personalised (auth required)
 *   GET /api/recommendations/popular   – trending products (public)
 *   GET /api/recommendations/search    – keyword-based suggestions (public)
 *   GET /api/recommendations/similar/:productId – similar products (public)
 */

const {
    getMLRecommendations,
    getPopularProducts,
    getSimilarProducts,
    getSearchSuggestions,
} = require('../services/recommendationService');

const { successResponse, errorResponse } = require('../utils/response');

// ─────────────────────────────────────────────
// GET /api/recommendations
// Personalised recommendations for the logged-in user.
// Falls back to popular products when ML is unavailable or user is new.
// ─────────────────────────────────────────────
async function getRecommendations(req, res) {
    try {
        const userId = req.user.id;
        const limit  = Math.min(parseInt(req.query.limit) || 10, 50);

        const { products, source } = await getMLRecommendations(userId, limit);

        // Fallback: user not in ML model yet OR ML offline → popular products
        if (!products.length) {
            const popular = await getPopularProducts(limit);
            return successResponse(res, 'Showing popular products (personalised model warming up)', {
                source:   'popular',
                products: popular,
            });
        }

        return successResponse(res, 'Personalised recommendations fetched successfully', {
            source,
            products,
        });
    } catch (error) {
        console.error('[recommendationController] getRecommendations:', error.message);
        return errorResponse(res, 'Failed to fetch recommendations', 500);
    }
}

// ─────────────────────────────────────────────
// GET /api/recommendations/popular
// No auth needed. Returns products ranked by interaction weight.
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
// No auth needed. Combines text search with AI suggestions, categories & brands.
// ─────────────────────────────────────────────
async function getSearchRecommendations(req, res) {
    try {
        const query = req.query.q || req.query.query || '';
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        if (!query.trim()) {
            return errorResponse(res, 'Search query (q) is required', 400);
        }

        const suggestions = await getSearchSuggestions(query, limit);

        return successResponse(res, 'Search suggestions fetched successfully', suggestions);
    } catch (error) {
        console.error('[recommendationController] getSearchRecommendations:', error.message);
        return errorResponse(res, 'Failed to fetch search suggestions', 500);
    }
}

// ─────────────────────────────────────────────
// GET /api/recommendations/similar/:productId
// No auth needed. Uses ML embeddings; falls back to same-category products.
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
    getPopular,
    getSearchRecommendations,
    getSimilar,
};