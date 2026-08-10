/**
 * recommendationService.js
 *
 * Service layer for all recommendation logic.
 * Handles ML server communication with graceful fallback to DB-level
 * popularity when the Python ML service is unavailable.
 */

const axios = require('axios');
const { Op, fn, col, literal } = require('sequelize');
const { Product, ProductImage, Category, Brand, UserProductInteraction } = require('../models/relationships');

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001';
const ML_TIMEOUT_MS = 8000;

// ─────────────────────────────────────────────
// ML Server helpers
// ─────────────────────────────────────────────

async function callML(endpoint, body) {
    const response = await axios.post(`${ML_BASE_URL}${endpoint}`, body, {
        timeout: ML_TIMEOUT_MS,
    });
    return response.data;
}

async function isMLHealthy() {
    try {
        const res = await axios.get(`${ML_BASE_URL}/health`, { timeout: 3000 });
        return res.data?.status === 'ok';
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────
// Product enrichment helper
// ─────────────────────────────────────────────

const PRODUCT_INCLUDE = [
    { model: Category,     as: 'category', attributes: ['id', 'name'] },
    { model: Brand,        as: 'brand',    attributes: ['id', 'name'] },
    { model: ProductImage, as: 'images',   attributes: ['id', 'image_url', 'is_primary'] },
];

async function hydrateProducts(productIds) {
    if (!productIds.length) return [];

    const products = await Product.findAll({
        where: { id: productIds, is_active: true },
        include: PRODUCT_INCLUDE,
    });

    // Preserve caller-supplied order
    const map = new Map(products.map((p) => [p.id, p]));
    return productIds.map((id) => map.get(id)).filter(Boolean);
}

// ─────────────────────────────────────────────
// 1. Personalised ML recommendations
// ─────────────────────────────────────────────

/**
 * Fetch ML-ranked recommendations for a user.
 * Returns { products, source } where source is 'ml' or 'popular'.
 */
async function getMLRecommendations(userId, limit = 10) {
    try {
        const data = await callML('/recommend', { user_id: String(userId), count: limit });

        if (data.unknown_user || !data.recommendations?.length) {
            // User has no training history — fall back to popular
            return { products: [], source: 'unknown_user' };
        }

        const productIds = data.recommendations.map((r) => r.product_id);
        const products   = await hydrateProducts(productIds);

        return { products, source: 'ml', scores: data.recommendations };
    } catch (err) {
        console.warn('[RecommendationService] ML server unavailable:', err.message);
        return { products: [], source: 'error' };
    }
}

// ─────────────────────────────────────────────
// 2. Popular products (DB fallback, no ML needed)
// ─────────────────────────────────────────────

/**
 * Returns products ranked by total interaction weight in the DB.
 * Works even when the ML service is offline.
 */
async function getPopularProducts(limit = 10) {
    // Aggregate interaction weights per product
    const topRows = await UserProductInteraction.findAll({
        attributes: [
            'product_id',
            [fn('SUM', col('weight')), 'total_weight'],
        ],
        group:  ['product_id'],
        order:  [[literal('total_weight'), 'DESC']],
        limit:  limit * 2, // fetch extra in case some are inactive
        raw:    true,
    });

    const productIds = topRows.map((r) => r.product_id);

    if (!productIds.length) {
        // No interaction data yet — return newest products
        return getNewestProducts(limit);
    }

    const products = await hydrateProducts(productIds);
    return products.slice(0, limit);
}

/**
 * Fallback when no interaction data exists — newest active products.
 */
async function getNewestProducts(limit = 10) {
    return Product.findAll({
        where:   { is_active: true },
        include: PRODUCT_INCLUDE,
        order:   [['created_at', 'DESC']],
        limit,
    });
}

// ─────────────────────────────────────────────
// 3. Similar products (ML embedding cosine similarity)
// ─────────────────────────────────────────────

/**
 * Products similar to a given product via the ML embedding space.
 * Falls back to same-category products when ML is unavailable.
 */
async function getSimilarProducts(productId, limit = 8) {
    try {
        const data = await callML('/similar', { product_id: String(productId), count: limit });

        if (!data.similar?.length) {
            return getSameCategoryProducts(productId, limit);
        }

        const productIds = data.similar.map((r) => r.product_id);
        const products   = await hydrateProducts(productIds);
        return products;
    } catch (err) {
        console.warn('[RecommendationService] Similar-products ML call failed:', err.message);
        return getSameCategoryProducts(productId, limit);
    }
}

/**
 * DB fallback: products in the same category, excluding the queried product.
 */
async function getSameCategoryProducts(productId, limit = 8) {
    const source = await Product.findByPk(productId, { attributes: ['id', 'category_id'] });
    if (!source) return [];

    return Product.findAll({
        where: {
            is_active:   true,
            category_id: source.category_id,
            id:          { [Op.ne]: productId },
        },
        include: PRODUCT_INCLUDE,
        order:   [['created_at', 'DESC']],
        limit,
    });
}

// ─────────────────────────────────────────────
// 4. Search-based suggestions
// ─────────────────────────────────────────────

/**
 * Products matching a keyword, optionally boosted by popularity within that category.
 */
async function getSearchSuggestions(query, limit = 10) {
    if (!query?.trim()) return [];

    const products = await Product.findAll({
        where: {
            is_active: true,
            [Op.or]: [
                { name:        { [Op.iLike]: `%${query}%` } },
                { description: { [Op.iLike]: `%${query}%` } },
            ],
        },
        include: PRODUCT_INCLUDE,
        order:   [['created_at', 'DESC']],
        limit:   limit * 2,
    });

    // Boost ordering by interaction weight for returned products
    if (!products.length) return [];

    const ids = products.map((p) => p.id);
    const weightRows = await UserProductInteraction.findAll({
        attributes: ['product_id', [fn('SUM', col('weight')), 'total_weight']],
        where:  { product_id: ids },
        group:  ['product_id'],
        raw:    true,
    });

    const weightMap = new Map(weightRows.map((r) => [r.product_id, Number(r.total_weight)]));

    const sorted = products
        .map((p) => ({ product: p, weight: weightMap.get(p.id) || 0 }))
        .sort((a, b) => b.weight - a.weight)
        .map((x) => x.product)
        .slice(0, limit);

    return sorted;
}

module.exports = {
    getMLRecommendations,
    getPopularProducts,
    getSimilarProducts,
    getSearchSuggestions,
    isMLHealthy,
};