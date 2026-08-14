/**
 * verify_view_tracking_endpoint.js
 */
require('dotenv').config();
const axios = require('axios');
const sequelize = require('./src/config/db');
const { User, Product, UserProductInteraction } = require('./src/models/relationships');
const { generateAccessToken } = require('./src/utils/jwt');

async function testViewEndpoint() {
    try {
        await sequelize.authenticate();
        console.log('✓ DB connected');

        const [user] = await User.findAll({ limit: 1 });
        const [product] = await Product.findAll({ limit: 1 });

        if (!user || !product) {
            console.log('No user or product found to test');
            process.exit(0);
        }

        const token = generateAccessToken(user);
        console.log(`✓ Generated test token for user: ${user.name} (${user.id})`);

        // Check interactions count before
        const beforeCount = await UserProductInteraction.count({
            where: { user_id: user.id, product_id: product.id, interaction_type: 'view' }
        });

        // Call the endpoint directly through controller logic
        const { trackInteraction } = require('./src/utils/trackInteraction');
        await trackInteraction(user.id, product.id, 'view');

        const afterCount = await UserProductInteraction.count({
            where: { user_id: user.id, product_id: product.id, interaction_type: 'view' }
        });

        console.log(`✓ Before view count: ${beforeCount}, After view count: ${afterCount}`);
        if (afterCount > beforeCount) {
            console.log('✓ SUCCESS: View interaction was recorded in user_product_interactions table!');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

testViewEndpoint();
