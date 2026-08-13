/**
 * recommendationService.js
 *
 * Service layer for Facebook-style user recommendation logic.
 * Handles ML server communication with hybrid search/view intent vector scoring and graceful DB fallback.
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

async function triggerMLTraining() {
    try {
        const data = await callML('/train', {});
        return { success: true, data };
    } catch (err) {
        console.error('[RecommendationService] Trigger training failed:', err.message);
        return { success: false, message: err.message };
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

    const map = new Map(products.map((p) => [p.id, p]));
    return productIds.map((id) => map.get(id)).filter(Boolean);
}

/**
 * Fetch product IDs recently searched or viewed by user
 */
async function getRecentUserInteractionProductIds(userId, limit = 15) {
    if (!userId) return [];
    try {
        const rows = await UserProductInteraction.findAll({
            attributes: ['product_id'],
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            limit,
            raw: true,
        });
        return Array.from(new Set(rows.map((r) => r.product_id)));
    } catch (err) {
        console.warn('[getRecentUserInteractionProductIds] Error:', err.message);
        return [];
    }
}

// ─────────────────────────────────────────────
// User-Centric DB Personalisation Fallback
// ─────────────────────────────────────────────

/**
 * DB-level personalization fallback based on user's interaction history (view & search).
 * Ensures User A (who viewed/searched A & B) gets only products matching categories/brands of A & B.
 */
async function getUserPersonalizedProducts(userId, limit = 10) {
    if (!userId) return { products: [], source: 'no_user', user_interests: {} };

    try {
        const userInteractions = await UserProductInteraction.findAll({
            attributes: [
                'product_id',
                'interaction_type',
                [fn('SUM', col('weight')), 'total_weight'],
            ],
            where: { user_id: userId },
            group: ['product_id', 'interaction_type'],
            order: [[literal('total_weight'), 'DESC']],
            limit: 30,
            raw: true,
        });

        if (!userInteractions.length) {
            return { products: [], source: 'no_history', user_interests: {} };
        }

        const interactedProductIds = Array.from(new Set(userInteractions.map((r) => r.product_id)));
        const interactedProducts   = await Product.findAll({
            where: { id: interactedProductIds },
            include: [
                { model: Category, as: 'category', attributes: ['id', 'name'] },
                { model: Brand,    as: 'brand',    attributes: ['id', 'name'] },
            ],
        });

        const categoryCounts = {};
        const categoryNames  = {};
        const brandCounts    = {};
        const brandNames     = {};

        interactedProducts.forEach((p) => {
            if (p.category_id) {
                categoryCounts[p.category_id] = (categoryCounts[p.category_id] || 0) + 1;
                if (p.category) categoryNames[p.category_id] = p.category.name;
            }
            if (p.brand_id) {
                brandCounts[p.brand_id] = (brandCounts[p.brand_id] || 0) + 1;
                if (p.brand) brandNames[p.brand_id] = p.brand.name;
            }
        });

        const topCategories = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
        const topBrands     = Object.keys(brandCounts).sort((a, b) => brandCounts[b] - brandCounts[a]);

        if (!topCategories.length && !topBrands.length) {
            return { products: [], source: 'no_preference', user_interests: {} };
        }

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
            limit: limit * 3,
        });

        const topCatSet   = new Set(topCategories);
        const topBrandSet = new Set(topBrands);

        const scored = matchedProducts.map((p) => {
            let score = 0;
            let reason = 'Recommended for you';

            if (topCatSet.has(p.category_id)) {
                score += 5;
                const catName = categoryNames[p.category_id] || 'your liked categories';
                reason = `Suggested based on your search & view of ${catName}`;
            }
            if (topBrandSet.has(p.brand_id)) {
                score += 3;
                const bName = brandNames[p.brand_id] || 'your liked brands';
                if (score > 5) {
                    reason += ` & ${bName}`;
                } else {
                    reason = `Suggested based on your interest in ${bName}`;
                }
            }

            const pObj = p.toJSON ? p.toJSON() : p;
            pObj.recommendation_reason = reason;
            return { product: pObj, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const resultProducts = scored.map((s) => s.product).slice(0, limit);

        const userInterests = {
            top_categories: topCategories.map((id) => categoryNames[id]).filter(Boolean),
            top_brands:     topBrands.map((id) => brandNames[id]).filter(Boolean),
        };

        return { products: resultProducts, source: 'user_history_personalized', user_interests: userInterests };
    } catch (err) {
        console.error('[getUserPersonalizedProducts] Error:', err.message);
        return { products: [], source: 'error', user_interests: {} };
    }
}

// ─────────────────────────────────────────────
// 1. Personalised recommendations (ML + DB Fallback)
// ─────────────────────────────────────────────

/**
 * Fetch ML-ranked recommendations for a user.
 * Incorporates real-time search/view intent product IDs.
 */
async function getMLRecommendations(userId, limit = 10) {
    const recentPids = await getRecentUserInteractionProductIds(userId, 15);

    try {
        const data = await callML('/recommend', {
            user_id: strOrNull(userId),
            count: limit,
            recent_product_ids: recentPids,
        });

        if (!data.unknown_user && data.recommendations?.length) {
            const productIds = data.recommendations.map((r) => r.product_id);
            const scoreMap   = new Map(data.recommendations.map((r) => [r.product_id, r.score]));
            const products   = await hydrateProducts(productIds);

            if (products.length > 0) {
                const enriched = products.map((p) => {
                    const pObj = p.toJSON ? p.toJSON() : p;
                    const catName = p.category?.name;
                    pObj.score = scoreMap.get(p.id) || 0;
                    pObj.recommendation_reason = catName
                        ? `Suggested for you based on your views & searches in ${catName}`
                        : 'Personalized recommendation based on your shopping profile';
                    return pObj;
                });
                return { products: enriched, source: 'ml_personalized', user_interests: { recent_view_count: recentPids.length } };
            }
        }
    } catch (err) {
        console.warn('[RecommendationService] ML server call failed:', err.message);
    }

    // Fallback 1: User-centric history personalization
    const personalized = await getUserPersonalizedProducts(userId, limit);
    if (personalized.products.length > 0) {
        return personalized;
    }

    // Fallback 2: Global popular products
    const popular = await getPopularProducts(limit);
    return { products: popular, source: 'popular', user_interests: {} };
}

function strOrNull(val) {
    return val ? String(val) : '';
}

// ─────────────────────────────────────────────
// 2. Popular products
// ─────────────────────────────────────────────

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
    return products.slice(0, limit).map((p) => {
        const pObj = p.toJSON ? p.toJSON() : p;
        pObj.recommendation_reason = 'Popular item trending on Angkor Mall';
        return pObj;
    });
}

async function getNewestProducts(limit = 10) {
    const products = await Product.findAll({
        where:   { is_active: true },
        include: PRODUCT_INCLUDE,
        order:   [['created_at', 'DESC']],
        limit,
    });

    return products.map((p) => {
        const pObj = p.toJSON ? p.toJSON() : p;
        pObj.recommendation_reason = 'Newly added product';
        return pObj;
    });
}

// ─────────────────────────────────────────────
// 3. Similar products
// ─────────────────────────────────────────────

async function getSimilarProducts(productId, limit = 8) {
    try {
        const data = await callML('/similar', { product_id: String(productId), count: limit });

        if (!data.similar?.length) {
            return getSameCategoryProducts(productId, limit);
        }

        const productIds = data.similar.map((r) => r.product_id);
        const products   = await hydrateProducts(productIds);
        return products.map((p) => {
            const pObj = p.toJSON ? p.toJSON() : p;
            pObj.recommendation_reason = 'Similar item matching this product';
            return pObj;
        });
    } catch (err) {
        console.warn('[RecommendationService] Similar-products ML call failed:', err.message);
        return getSameCategoryProducts(productId, limit);
    }
}

async function getSameCategoryProducts(productId, limit = 8) {
    const source = await Product.findByPk(productId, { attributes: ['id', 'category_id'] });
    if (!source) return [];

    const products = await Product.findAll({
        where: {
            is_active:   true,
            category_id: source.category_id,
            id:          { [Op.ne]: productId },
        },
        include: PRODUCT_INCLUDE,
        order:   [['created_at', 'DESC']],
        limit,
    });

    return products.map((p) => {
        const pObj = p.toJSON ? p.toJSON() : p;
        pObj.recommendation_reason = 'More items in this category';
        return pObj;
    });
}

// ─────────────────────────────────────────────
// 4. FB-style AI search-based suggestions
// ─────────────────────────────────────────────

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

    const categories = await Category.findAll({
        where: { name: { [Op.iLike]: `%${trimmed}%` } },
        attributes: ['id', 'name'],
        limit: 5,
    });

    const brands = await Brand.findAll({
        where: { name: { [Op.iLike]: `%${trimmed}%` } },
        attributes: ['id', 'name'],
        limit: 5,
    });

    const categoryIds = categories.map((c) => c.id);
    const brandIds    = brands.map((b) => b.id);

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

    if (userId && products.length > 0) {
        const matchedProductIds = products.map((p) => p.id);
        trackInteractionBulk(userId, matchedProductIds, 'search');
    }

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

    const models = sortedProducts.map((p) => ({
        id:          p.id,
        name:        p.name,
        price:       p.price,
        category:    p.category?.name || null,
        brand:       p.brand?.name || null,
        primary_img: p.images?.find((img) => img.is_primary)?.image_url || p.image_url || null,
    }));

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
    triggerMLTraining,
};