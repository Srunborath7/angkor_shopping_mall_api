/**
 * trackInteraction.js
 *
 * Records a user–product interaction into the `user_product_interactions` table.
 * Called silently (never throws) so it never disrupts the main request flow.
 *
 * Interaction weights:
 *   view   = 1  (user opened a product detail page)
 *   search = 2  (user searched and this product appeared in results)
 *   cart   = 3  (user added product to cart)
 *   order  = 5  (user ordered this product)
 */

const UserProductInteraction = require('../models/userProductInteractionModel');

const INTERACTION_WEIGHTS = {
    view:   1,
    search: 2,
    cart:   3,
    order:  5,
};

/**
 * Track a single user–product interaction.
 *
 * @param {string|null} userId     - UUID of the authenticated user (skipped if null)
 * @param {string}      productId  - UUID of the product
 * @param {string}      type       - One of: 'view' | 'search' | 'cart' | 'order'
 */
async function trackInteraction(userId, productId, type) {
    if (!userId || !productId) return;

    const weight = INTERACTION_WEIGHTS[type];
    if (!weight) {
        console.warn(`[trackInteraction] Unknown interaction type: "${type}"`);
        return;
    }

    try {
        await UserProductInteraction.create({
            user_id:          userId,
            product_id:       productId,
            interaction_type: type,
            weight,
        });
    } catch (err) {
        // Log but never block the main request
        console.error(`[trackInteraction] Failed to record ${type} interaction:`, err.message);
    }
}

/**
 * Track interactions for multiple products at once (e.g. search results or order items).
 *
 * @param {string|null} userId      - UUID of the authenticated user
 * @param {string[]}    productIds  - Array of product UUIDs
 * @param {string}      type        - Interaction type
 */
async function trackInteractionBulk(userId, productIds, type) {
    if (!userId || !productIds || productIds.length === 0) return;

    const weight = INTERACTION_WEIGHTS[type];
    if (!weight) return;

    const records = productIds.map((productId) => ({
        user_id:          userId,
        product_id:       productId,
        interaction_type: type,
        weight,
    }));

    try {
        await UserProductInteraction.bulkCreate(records, { ignoreDuplicates: false });
    } catch (err) {
        console.error(`[trackInteraction] Bulk ${type} tracking failed:`, err.message);
    }
}

module.exports = { trackInteraction, trackInteractionBulk };
