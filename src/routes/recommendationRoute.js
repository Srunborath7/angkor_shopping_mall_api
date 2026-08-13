const express = require('express');
const router  = express.Router();

const auth         = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');
const {
    getRecommendations,
    trackUserInteraction,
    triggerTrain,
    getPopular,
    getSearchRecommendations,
    getSimilar,
} = require('../controllers/recommendationController');

/**
 * GET /api/recommendations
 * Personalised FB-style recommendations — requires JWT auth.
 */
router.get('/', auth, getRecommendations);

/**
 * POST /api/recommendations/track
 * Explicit frontend interaction tracker for view/search/cart/order — auth required.
 * Body: { productId: "...", type: "view" | "search" | "cart" | "order" }
 */
router.post('/track', auth, trackUserInteraction);

/**
 * POST /api/recommendations/train
 * Trigger ML model retraining on latest interaction data — auth required.
 */
router.post('/train', auth, triggerTrain);

/**
 * GET /api/recommendations/popular
 * Globally trending products — public.
 */
router.get('/popular', getPopular);

/**
 * GET /api/recommendations/search?q=keyword
 * Text-match + AI search suggestions with optional auth for personalization.
 */
router.get('/search', optionalAuth, getSearchRecommendations);

/**
 * GET /api/recommendations/similar/:productId
 * Products similar to a given product (ML embeddings or category fallback) — public.
 */
router.get('/similar/:productId', getSimilar);

module.exports = router;