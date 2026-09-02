const { Op } = require('sequelize');
const UserProductInteraction = require('../models/userProductInteractionModel');

const INTERACTION_WEIGHTS = {
    view: 1,
    search: 2,
    cart: 3,
    order: 5,
};

/**
 * Track a single user-product interaction.
 */
async function trackInteraction(userId, productId, type) {
    if (!userId || !productId) return;

    const weight = INTERACTION_WEIGHTS[type];
    if (!weight) return;

    try {
        await UserProductInteraction.create({
            user_id: userId,
            product_id: productId,
            interaction_type: type,
            weight,
            created_at: new Date(),
        }, { logging: false });
    } catch (err) {
        // Silently ignore tracking errors so they never disrupt user requests
    }
}

/**
 * Track interactions for multiple products at once.
 */
async function trackInteractionBulk(userId, productIds, type) {
    if (!userId || !productIds || productIds.length === 0) return;

    const weight = INTERACTION_WEIGHTS[type];
    if (!weight) return;

    const now = new Date();
    const records = productIds.map((productId) => ({
        user_id: userId,
        product_id: productId,
        interaction_type: type,
        weight,
        created_at: now,
    }));

    try {
        await UserProductInteraction.bulkCreate(records, { ignoreDuplicates: true, logging: false });
    } catch (err) {
        // Silently ignore tracking errors so they never disrupt user requests
    }
}

/**
 * Automatically cleans up user interaction records older than the specified retention window.
 */
async function cleanupOldInteractions(days = 2) {
    try {
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const deletedCount = await UserProductInteraction.destroy({
            where: {
                created_at: {
                    [Op.lt]: cutoffDate,
                },
            },
            logging: false
        });
        return deletedCount;
    } catch (err) {
        return 0;
    }
}

module.exports = { 
    trackInteraction, 
    trackInteractionBulk, 
    cleanupOldInteractions 
};
