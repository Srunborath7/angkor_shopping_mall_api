const https = require('https');
const { Product, CartItem, Order, OrderItem, Category, Brand } = require('../models/relationships');
const { Op } = require('sequelize');

// Helper to perform POST request using native HTTPS
const makePostRequest = (url, data) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                } else {
                    reject(new Error(`Status: ${res.statusCode}, Body: ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
};

const getRecommendations = async (userId) => {
    try {
        // 1. Fetch User's Cart Items
        const cartItems = await CartItem.findAll({
            where: { user_id: userId },
            include: [{ model: Product, as: 'product' }]
        });

        // 2. Fetch User's Purchase History
        const purchaseHistory = await Order.findAll({
            where: { user_id: userId },
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [{ model: Product, as: 'product' }]
                }
            ]
        });

        // 3. Fetch All Available Products
        const availableProducts = await Product.findAll({
            where: { is_active: true },
            include: [
                { model: Category, as: 'category' },
                { model: Brand, as: 'brand' }
            ]
        });

        const geminiKey = process.env.GEMINI_API_KEY;

        if (geminiKey) {
            // Setup Prompt for AI
            const simplifiedCart = cartItems.map(c => ({
                id: c.product_id,
                name: c.product?.name,
                category: c.product?.category_id
            }));

            const simplifiedHistory = purchaseHistory.map(o => ({
                orderId: o.id,
                items: o.items.map(i => ({
                    id: i.product_id,
                    name: i.product?.name,
                    category: i.product?.category_id
                }))
            }));

            const simplifiedProducts = availableProducts.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                price: p.price,
                category: p.category?.name,
                brand: p.brand?.name
            }));

            const prompt = `You are a personalized AI product recommender for "Angkor Shopping Mall".
Based on the user's cart items and purchase history, recommend up to 3 products from the available products list below that they might like.
Return the result strictly as a valid JSON array of objects, containing ONLY the fields "id" (the product UUID) and "reason" (a friendly, customer-centric 1-2 sentence explanation of why this product fits their taste).
Do not add any markdown, comments, formatting, or extra text. Return only the JSON content.

User's Cart:
${JSON.stringify(simplifiedCart, null, 2)}

User's Purchase History:
${JSON.stringify(simplifiedHistory, null, 2)}

Available Products:
${JSON.stringify(simplifiedProducts, null, 2)}`;

            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            };

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
            
            const responseText = await makePostRequest(url, requestBody);
            const responseData = JSON.parse(responseText);

            if (responseData.candidates && responseData.candidates[0]?.content?.parts[0]?.text) {
                let aiText = responseData.candidates[0].content.parts[0].text;
                // Strip markdown styling if any
                aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
                const recommendations = JSON.parse(aiText);

                // Join with database product models
                const finalRecommendations = [];
                for (const rec of recommendations) {
                    const product = availableProducts.find(p => p.id === rec.id);
                    if (product) {
                        finalRecommendations.push({
                            product,
                            reason: rec.reason
                        });
                    }
                }

                if (finalRecommendations.length > 0) {
                    return finalRecommendations;
                }
            }
        }

        // 4. Fallback to Local Recommendation logic if Gemini is not set up or fails
        return await getFallbackRecommendations(userId, cartItems, purchaseHistory);

    } catch (error) {
        console.error("AI Recommendation error:", error);
        // Fallback in case of general exception
        try {
            const cartItems = await CartItem.findAll({
                where: { user_id: userId },
                include: [{ model: Product, as: 'product' }]
            });
            const purchaseHistory = await Order.findAll({
                where: { user_id: userId },
                include: [{ model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] }]
            });
            return await getFallbackRecommendations(userId, cartItems, purchaseHistory);
        } catch (fallbackError) {
            console.error("Fallback recommendation error:", fallbackError);
            return [];
        }
    }
};

const getFallbackRecommendations = async (userId, cartItems, purchaseHistory) => {
    const historyCategories = new Set();
    const historyBrands = new Set();
    const excludedProductIds = new Set();

    cartItems.forEach(item => {
        excludedProductIds.add(item.product_id);
        if (item.product) {
            if (item.product.category_id) historyCategories.add(item.product.category_id);
            if (item.product.brand_id) historyBrands.add(item.product.brand_id);
        }
    });

    purchaseHistory.forEach(order => {
        if (order.items) {
            order.items.forEach(item => {
                excludedProductIds.add(item.product_id);
                if (item.product) {
                    if (item.product.category_id) historyCategories.add(item.product.category_id);
                    if (item.product.brand_id) historyBrands.add(item.product.brand_id);
                }
            });
        }
    });

    const products = await Product.findAll({
        where: { is_active: true },
        include: [
            { model: Category, as: 'category' },
            { model: Brand, as: 'brand' }
        ]
    });

    const scoredProducts = products
        .filter(prod => !excludedProductIds.has(prod.id))
        .map(prod => {
            let score = 0;
            if (historyCategories.has(prod.category_id)) score += 2;
            if (historyBrands.has(prod.brand_id)) score += 1;
            return { product: prod, score };
        });

    scoredProducts.sort((a, b) => b.score - a.score);
    const topScored = scoredProducts.slice(0, 3);

    return topScored.map(item => {
        let reason = "A popular choice in Angkor Shopping Mall that you might like!";
        if (item.score > 0) {
            const reasons = [];
            if (historyCategories.has(item.product.category_id) && item.product.category) {
                reasons.push(`category "${item.product.category.name}"`);
            }
            if (historyBrands.has(item.product.brand_id) && item.product.brand) {
                reasons.push(`brand "${item.product.brand.name}"`);
            }
            reason = `Recommended based on your recent interest in ${reasons.join(' and ')}.`;
        }
        return {
            product: item.product,
            reason: reason
        };
    });
};

module.exports = {
    getRecommendations
};
