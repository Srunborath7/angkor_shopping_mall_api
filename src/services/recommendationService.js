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

let isMLServerOffline = false;
let lastMLOfflineCheckTime = 0;
const ML_COOLDOWN_MS = 30000; // 30s cooldown after connection failure

async function callML(endpoint, body) {
    const now = Date.now();
    if (isMLServerOffline && (now - lastMLOfflineCheckTime < ML_COOLDOWN_MS)) {
        const err = new Error('ML server in offline cooldown');
        err.isCooldown = true;
        throw err;
    }

    try {
        const response = await axios.post(`${ML_BASE_URL}${endpoint}`, body, {
            timeout: ML_TIMEOUT_MS,
        });
        isMLServerOffline = false;
        return response.data;
    } catch (err) {
        if (!isMLServerOffline) {
            console.warn(`[RecommendationService] ML server offline (${ML_BASE_URL}) — using DB personalization fallback. (${err.message})`);
        }
        isMLServerOffline = true;
        lastMLOfflineCheckTime = now;
        throw err;
    }
}

async function isMLHealthy() {
    try {
        const res = await axios.get(`${ML_BASE_URL}/health`, { timeout: 3000 });
        isMLServerOffline = false;
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
        if (!err.isCooldown) {
            console.error('[RecommendationService] Trigger training failed:', err.message);
        }
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
 * DB-level personalization based on user's interaction history (view, search, cart, order).
 * Ensures User A (e.g., Bora searching/viewing Apple) gets Apple products,
 * while User B (e.g., Navy searching/viewing Banana) gets Banana products.
 */
async function getUserPersonalizedProducts(userId, limit = 10) {
    if (!userId) return { products: [], source: 'no_user', user_interests: {} };

    try {
        const userInteractions = await UserProductInteraction.findAll({
            attributes: [
                'product_id',
                'interaction_type',
                'weight',
                'created_at',
            ],
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            limit: 50,
            raw: true,
        });

        if (!userInteractions.length) {
            return { products: [], source: 'no_history', user_interests: {} };
        }

        // Aggregate interaction weights per product
        const productWeightMap = {};
        userInteractions.forEach((row) => {
            const pid = row.product_id;
            const w = Number(row.weight) || 1;
            productWeightMap[pid] = (productWeightMap[pid] || 0) + w;
        });

        const interactedProductIds = Object.keys(productWeightMap);
        const interactedProducts   = await Product.findAll({
            where: { id: interactedProductIds },
            include: [
                { model: Category, as: 'category', attributes: ['id', 'name'] },
                { model: Brand,    as: 'brand',    attributes: ['id', 'name'] },
            ],
        });

        if (!interactedProducts.length) {
            return { products: [], source: 'no_history', user_interests: {} };
        }

        // Common stop words to ignore during keyword extraction
        const STOP_WORDS = new Set([
            'and', 'the', 'for', 'with', 'men', 'mens', 'women', 'womens',
            'pro', 'max', 'air', 'mini', 'plus', 'ultra', 'new', 'best',
            'set', 'pack', 'size', 'color', 'black', 'white', 'red', 'blue',
            'fresh', 'harvest', 'organic', 'crispy', 'golden', 'classic', 'yellow',
            'item', 'test', 'brand', 'product', 'quality', 'unisex', 'adult'
        ]);

        const categoryCounts = {};
        const categoryNames  = {};
        const brandCounts    = {};
        const brandNames     = {};
        const keywordWeights = {};

        interactedProducts.forEach((p) => {
            const pWeight = productWeightMap[p.id] || 1;

            if (p.category_id) {
                categoryCounts[p.category_id] = (categoryCounts[p.category_id] || 0) + pWeight;
                if (p.category) categoryNames[p.category_id] = p.category.name;
            }
            if (p.brand_id) {
                brandCounts[p.brand_id] = (brandCounts[p.brand_id] || 0) + pWeight;
                if (p.brand) brandNames[p.brand_id] = p.brand.name;
            }

            // Extract keywords from product name, brand name, and category name
            const fullText = `${p.name || ''} ${p.brand?.name || ''} ${p.category?.name || ''}`.toLowerCase();
            const words = fullText.split(/[^a-z0-9]+/i).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

            words.forEach((w) => {
                keywordWeights[w] = (keywordWeights[w] || 0) + pWeight;
            });
        });

        const topCategories = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
        const topBrands     = Object.keys(brandCounts).sort((a, b) => brandCounts[b] - brandCounts[a]);
        const topKeywords   = Object.keys(keywordWeights).sort((a, b) => keywordWeights[b] - keywordWeights[a]).slice(0, 10);

        // Fetch all candidate products
        const candidateProducts = await Product.findAll({
            where: { is_active: true },
            include: PRODUCT_INCLUDE,
            order: [['created_at', 'DESC']],
            limit: 100,
        });

        const topCatSet   = new Set(topCategories);
        const topBrandSet = new Set(topBrands);
        const interactedSet = new Set(interactedProductIds);

        const scored = candidateProducts.map((p) => {
            let score = 0;
            let matchedKeyword = null;
            let matchedBrand = null;
            let matchedCat = null;

            const pNameLower = (p.name || '').toLowerCase();
            const pDescLower = (p.description || '').toLowerCase();
            const pBrandLower = (p.brand?.name || '').toLowerCase();
            const pCatLower   = (p.category?.name || '').toLowerCase();

            // 1. Keyword match (highest priority for user intent, e.g. "apple", "banana", "nike")
            topKeywords.forEach((kw) => {
                if (pNameLower.includes(kw)) {
                    score += 25 * (keywordWeights[kw] || 1);
                    if (!matchedKeyword || !pNameLower.includes(matchedKeyword)) matchedKeyword = kw;
                } else if (pBrandLower.includes(kw)) {
                    score += 20 * (keywordWeights[kw] || 1);
                    if (!matchedKeyword) matchedKeyword = kw;
                } else if (pDescLower.includes(kw) || pCatLower.includes(kw)) {
                    score += 10 * (keywordWeights[kw] || 1);
                    if (!matchedKeyword) matchedKeyword = kw;
                }
            });

            // 2. Brand match
            if (topBrandSet.has(p.brand_id)) {
                score += 15 * (brandCounts[p.brand_id] || 1);
                if (!matchedBrand && p.brand) matchedBrand = p.brand.name;
            }

            // 3. Category match
            if (topCatSet.has(p.category_id)) {
                score += 8 * (categoryCounts[p.category_id] || 1);
                if (!matchedCat && p.category) matchedCat = p.category.name;
            }

            // 4. Direct interaction bonus
            if (interactedSet.has(p.id)) {
                score += 12;
            }

            const displayKw = matchedKeyword
                ? matchedKeyword.charAt(0).toUpperCase() + matchedKeyword.slice(1)
                : null;

            let reason = 'Recommended for you';
            if (displayKw && (pNameLower.includes(matchedKeyword) || pBrandLower.includes(matchedKeyword))) {
                reason = `Suggested for you based on your interest in ${displayKw}`;
            } else if (matchedBrand) {
                reason = `Suggested based on your interest in ${matchedBrand}`;
            } else if (matchedCat) {
                reason = `Suggested based on your search & views in ${matchedCat}`;
            } else if (displayKw) {
                reason = `Suggested based on your search for "${displayKw}"`;
            }

            const pObj = p.toJSON ? p.toJSON() : p;
            pObj.recommendation_reason = reason;
            return { product: pObj, score };
        });

        // Filter candidates that match user's interests (score > 0)
        const matched = scored.filter((s) => s.score > 0);
        matched.sort((a, b) => b.score - a.score);

        const resultProducts = matched.map((s) => s.product).slice(0, limit);

        const userInterests = {
            top_keywords:   topKeywords.map((k) => k.charAt(0).toUpperCase() + k.slice(1)),
            top_categories: topCategories.map((id) => categoryNames[id]).filter(Boolean),
            top_brands:     topBrands.map((id) => brandNames[id]).filter(Boolean),
        };

        if (resultProducts.length > 0) {
            return {
                products: resultProducts,
                source: 'user_history_personalized',
                user_interests: userInterests
            };
        }

        return { products: [], source: 'no_match', user_interests: userInterests };
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
        if (!err.isCooldown) {
            console.warn('[RecommendationService] ML server call failed:', err.message);
        }
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
        if (!err.isCooldown) {
            console.warn('[RecommendationService] Similar-products ML call failed:', err.message);
        }
        return getSameCategoryProducts(productId, limit);
    }
}

async function getSameCategoryProducts(productId, limit = 8) {
    const source = await Product.findByPk(productId, { attributes: ['id', 'category_id', 'brand_id'] });
    if (!source) return [];

    const existingIds = new Set([productId]);
    const results = [];

    // 1. Same category
    if (source.category_id) {
        const catProducts = await Product.findAll({
            where: {
                is_active: true,
                category_id: source.category_id,
                id: { [Op.ne]: productId },
            },
            include: PRODUCT_INCLUDE,
            order: [['created_at', 'DESC']],
            limit,
        });

        catProducts.forEach((p) => {
            if (!existingIds.has(p.id)) {
                existingIds.add(p.id);
                const pObj = p.toJSON ? p.toJSON() : p;
                pObj.recommendation_reason = 'More items in this category';
                results.push(pObj);
            }
        });
    }

    // 2. Same brand fallback if results < limit
    if (results.length < limit && source.brand_id) {
        const brandProducts = await Product.findAll({
            where: {
                is_active: true,
                brand_id: source.brand_id,
                id: { [Op.notIn]: Array.from(existingIds) },
            },
            include: PRODUCT_INCLUDE,
            order: [['created_at', 'DESC']],
            limit: limit - results.length,
        });

        brandProducts.forEach((p) => {
            if (!existingIds.has(p.id)) {
                existingIds.add(p.id);
                const pObj = p.toJSON ? p.toJSON() : p;
                pObj.recommendation_reason = 'More items from this brand';
                results.push(pObj);
            }
        });
    }

    // 3. General popular fallback if results < limit
    if (results.length < limit) {
        const popular = await Product.findAll({
            where: {
                is_active: true,
                id: { [Op.notIn]: Array.from(existingIds) },
            },
            include: PRODUCT_INCLUDE,
            order: [['created_at', 'DESC']],
            limit: limit - results.length,
        });

        popular.forEach((p) => {
            if (!existingIds.has(p.id)) {
                existingIds.add(p.id);
                const pObj = p.toJSON ? p.toJSON() : p;
                pObj.recommendation_reason = 'Recommended for you';
                results.push(pObj);
            }
        });
    }

    return results.slice(0, limit);
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