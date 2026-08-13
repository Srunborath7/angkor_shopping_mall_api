const express = require('express');
const router  = express.Router();

const auth         = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');
const {
    getRecommendations,
    getPopular,
    getSearchRecommendations,
    getSimilar,
} = require('../controllers/recommendationController');

/**
 * GET /api/recommendations
 * Personalised recommendations — requires JWT auth.
 * Falls back to popular when user has no history or ML is offline.
 */
router.get('/', auth, getRecommendations);

/**
 * GET /api/recommendations/popular
 * Globally trending products — public, no auth needed.
 * Query params: ?limit=10
 */
router.get('/popular', getPopular);

/**
 * GET /api/recommendations/search?q=keyword
 * Text-match + AI search suggestions with optional auth for personalization — public/optionalAuth.
 * Query params: ?q=iphone&limit=10
 */
router.get('/search', optionalAuth, getSearchRecommendations);

/**
 * GET /api/recommendations/similar/:productId
 * Products similar to a given product (ML embeddings or same-category fallback) — public.
 * Query params: ?limit=8
 */
router.get('/similar/:productId', getSimilar);

module.exports = router;