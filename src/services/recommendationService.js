/**
 * recommendationService.js
 *
 * Service layer for all recommendation logic.
 * Handles ML server communication with graceful fallback to DB-level
 * user-centric interest personalization when the Python ML service is unavailable or warming up.
 */

const axios = require('axios');
const { Op, fn, col, literal } = require('sequelize');
const { Product, ProductImage, Category, Brand, UserProductInteraction } = require('../models/relationships');
const { trackInteractionBulk } = require('../utils/trackInteraction');

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
// User-Centric DB Personalisation Fallback
// ─────────────────────────────────────────────

/**
 * DB-level personalization fallback based on user's interaction history.
 * Used when the user is new to the ML model matrix or when the ML service is offline.
 */
async function getUserPersonalizedProducts(userId, limit = 10) {
    if (!userId) return { products: [], source: 'no_user' };

    try {
        // Get products the user has previously interacted with
        const userInteractions = await UserProductInteraction.findAll({
            attributes: [
                'product_id',
                [fn('SUM', col('weight')), 'total_weight'],
            ],
            where: { user_id: userId },
            group: ['product_id'],
            order: [[literal('total_weight'), 'DESC']],
            limit: 25,
            raw: true,
        });

        if (!userInteractions.length) {
            return { products: [], source: 'no_history' };
        }

        const interactedProductIds = userInteractions.map((r) => r.product_id);
        const interactedProducts   = await Product.findAll({
            where: { id: interactedProductIds },
            attributes: ['id', 'category_id', 'brand_id'],
            raw: true,
        });

        const categoryCounts = {};
        const brandCounts    = {};

        interactedProducts.forEach((p) => {
            if (p.category_id) {
                categoryCounts[p.category_id] = (categoryCounts[p.category_id] || 0) + 1;
            }
            if (p.brand_id) {
                brandCounts[p.brand_id] = (brandCounts[p.brand_id] || 0) + 1;
            }
        });

        const topCategories = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
        const topBrands     = Object.keys(brandCounts).sort((a, b) => brandCounts[b] - brandCounts[a]);

        if (!topCategories.length && !topBrands.length) {
            return { products: [], source: 'no_preference' };
        }

        // Find products matching user's top categories or brands
        const matchedProducts = await Product.findAll({
            where: {
                is_active: true,
                [Op.or]: [
                    ...(topCategories.length ? [{ category_id: { [Op.in]: topCategories } }] : []),
                    ...(topBrands.length     ? [{ brand_id:    { [Op.in]: topBrands } }] : []),
                ],
            },
            include: PRODUCT_INCLUDE,
            order: [['created_at', 'DESC']],
            limit: limit * 2,
        });

        const topCatSet   = new Set(topCategories);
        const topBrandSet = new Set(topBrands);

        const scored = matchedProducts.map((p) => {
            let score = 0;
            if (topCatSet.has(p.category_id)) score += 3;
            if (topBrandSet.has(p.brand_id)) score += 2;
            return { product: p, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const resultProducts = scored.map((s) => s.product).slice(0, limit);

        return { products: resultProducts, source: 'user_history_personalized' };
    } catch (err) {
        console.error('[getUserPersonalizedProducts] Error:', err.message);
        return { products: [], source: 'error' };
    }
}

// ─────────────────────────────────────────────
// 1. Personalised recommendations (ML + DB Fallback)
// ─────────────────────────────────────────────

/**
 * Fetch ML-ranked recommendations for a user.
 * Falls back to user-centric DB history, then to overall popular products.
 */
async function getMLRecommendations(userId, limit = 10) {
    try {
        const data = await callML('/recommend', { user_id: String(userId), count: limit });

        if (!data.unknown_user && data.recommendations?.length) {
            const productIds = data.recommendations.map((r) => r.product_id);
            const products   = await hydrateProducts(productIds);
            if (products.length > 0) {
                return { products, source: 'ml', scores: data.recommendations };
            }
        }
    } catch (err) {
        console.warn('[RecommendationService] ML server unavailable:', err.message);
    }

    // Fallback 1: User-centric history personalization
    const personalized = await getUserPersonalizedProducts(userId, limit);
    if (personalized.products.length > 0) {
        return personalized;
    }

    // Fallback 2: Global popular products
    const popular = await getPopularProducts(limit);
    return { products: popular, source: 'popular' };
}

// ─────────────────────────────────────────────
// 2. Popular products (DB fallback, no ML needed)
// ─────────────────────────────────────────────

/**
 * Returns products ranked by total interaction weight in the DB.
 * Works even when the ML service is offline.
 */
async function getPopularProducts(limit = 10) {
    const topRows = await UserProductInteraction.findAll({
        attributes: [
            'product_id',
            [fn('SUM', col('weight')), 'total_weight'],
        ],
        group:  ['product_id'],
        order:  [[literal('total_weight'), 'DESC']],
        limit:  limit * 2,
        raw:    true,
    });

    const productIds = topRows.map((r) => r.product_id);

    if (!productIds.length) {
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
// 4. FB-style AI search-based suggestions
// ─────────────────────────────────────────────

/**
 * AI-enhanced search suggestions.
 * Returns matching categories, brands, product models, and AI-suggested related items.
 * Tracks search interactions when userId is supplied for personalized profile building.
 */
async function getSearchSuggestions(query, limit = 10, userId = null) {
    const trimmed = query?.trim() || '';
    if (!trimmed) {
        return {
            source:            'search',
            query:             '',
            categories:        [],
            brands:            [],
            products:          [],
            models:            [],
            ai_suggestions:    [],
            user_personalized: Boolean(userId),
        };
    }

    // 1. Matching categories by name
    const categories = await Category.findAll({
        where: { name: { [Op.iLike]: `%${trimmed}%` } },
        attributes: ['id', 'name'],
        limit: 5,
    });

    // 2. Matching brands by name
    const brands = await Brand.findAll({
        where: { name: { [Op.iLike]: `%${trimmed}%` } },
        attributes: ['id', 'name'],
        limit: 5,
    });

    const categoryIds = categories.map((c) => c.id);
    const brandIds    = brands.map((b) => b.id);

    // 3. Direct matching products (by product title/desc or matching category/brand)
    const products = await Product.findAll({
        where: {
            is_active: true,
            [Op.or]: [
                { name:        { [Op.iLike]: `%${trimmed}%` } },
                { description: { [Op.iLike]: `%${trimmed}%` } },
                ...(categoryIds.length ? [{ category_id: { [Op.in]: categoryIds } }] : []),
                ...(brandIds.length    ? [{ brand_id:    { [Op.in]: brandIds } }] : []),
            ],
        },
        include: PRODUCT_INCLUDE,
        order:   [['created_at', 'DESC']],
        limit:   limit * 2,
    });

    // Track search interaction if user is logged in
    if (userId && products.length > 0) {
        const matchedProductIds = products.map((p) => p.id);
        trackInteractionBulk(userId, matchedProductIds, 'search');
    }

    // Extract categories/brands from found products if not already matched
    const categoryMap = new Map(categories.map((c) => [c.id, c.toJSON ? c.toJSON() : c]));
    const brandMap    = new Map(brands.map((b) => [b.id, b.toJSON ? b.toJSON() : b]));

    for (const p of products) {
        if (p.category && !categoryMap.has(p.category.id)) {
            categoryMap.set(p.category.id, { id: p.category.id, name: p.category.name });
        }
        if (p.brand && !brandMap.has(p.brand.id)) {
            brandMap.set(p.brand.id, { id: p.brand.id, name: p.brand.name });
        }
    }

    // Sort products by interaction weight popularity
    let sortedProducts = products;
    if (products.length > 0) {
        const productIds = products.map((p) => p.id);
        const weightRows = await UserProductInteraction.findAll({
            attributes: ['product_id', [fn('SUM', col('weight')), 'total_weight']],
            where:  { product_id: productIds },
            group:  ['product_id'],
            raw:    true,
        });

        const weightMap = new Map(weightRows.map((r) => [r.product_id, Number(r.total_weight)]));

        sortedProducts = products
            .map((p) => ({ product: p, weight: weightMap.get(p.id) || 0 }))
            .sort((a, b) => b.weight - a.weight)
            .map((x) => x.product)
            .slice(0, limit);
    }

    // Extract product model names (Facebook-style model suggestions)
    const models = sortedProducts.map((p) => ({
        id:          p.id,
        name:        p.name,
        price:       p.price,
        category:    p.category?.name || null,
        brand:       p.brand?.name || null,
        primary_img: p.images?.find((img) => img.is_primary)?.image_url || p.image_url || null,
    }));

    // 4. AI-suggested related items via ML cosine similarity or category matching
    let ai_suggestions = [];
    const directMatchedIds = new Set(sortedProducts.map((p) => p.id));

    if (sortedProducts.length > 0) {
        const topProductId = sortedProducts[0].id;
        try {
            const similarItems = await getSimilarProducts(topProductId, 8);
            ai_suggestions = similarItems.filter((p) => !directMatchedIds.has(p.id));
        } catch (err) {
            console.warn('[RecommendationService] AI suggestion retrieval failed:', err.message);
        }
    }

    // Fallback AI suggestions: products from matched categories/brands if ML didn't yield extra items
    if (!ai_suggestions.length && (categoryMap.size > 0 || brandMap.size > 0)) {
        const catIds = Array.from(categoryMap.keys());
        const bIds   = Array.from(brandMap.keys());

        ai_suggestions = await Product.findAll({
            where: {
                is_active: true,
                ...(directMatchedIds.size ? { id: { [Op.notIn]: Array.from(directMatchedIds) } } : {}),
                [Op.or]: [
                    ...(catIds.length ? [{ category_id: { [Op.in]: catIds } }] : []),
                    ...(bIds.length   ? [{ brand_id:    { [Op.in]: bIds } }] : []),
                ],
            },
            include: PRODUCT_INCLUDE,
            order:   [['created_at', 'DESC']],
            limit:   6,
        });
    }

    return {
        source:            'ai_enhanced_search',
        query:             trimmed,
        categories:        Array.from(categoryMap.values()).slice(0, 5),
        brands:            Array.from(brandMap.values()).slice(0, 5),
        models:            models.slice(0, 8),
        products:          sortedProducts,
        ai_suggestions:    ai_suggestions.slice(0, 8),
        user_personalized: Boolean(userId),
    };
}

module.exports = {
    getMLRecommendations,
    getUserPersonalizedProducts,
    getPopularProducts,
    getSimilarProducts,
    getSearchSuggestions,
    isMLHealthy,
};