/**
 * seed-interactions.js
 *
 * Seeds realistic user–product interaction data where:
 *   - User A (Dara) searches & views Tech/Phone products
 *   - User B (audit_user / K K) searches & views Shoe/Fashion products
 *   - Other users have varied interactions across products
 *
 * Run:  node seed-interactions.js
 */

require("dotenv").config();
const sequelize              = require("./src/config/db");
const UserProductInteraction = require("./src/models/userProductInteractionModel");
const { Product, Category, User } = require("./src/models/relationships");

const WEIGHTS = { view: 1, search: 2, cart: 3, order: 5 };

async function main() {
    await sequelize.authenticate();
    console.log("✅ DB connected");

    const users    = await User.findAll({ attributes: ["id", "name", "email"], raw: true });
    const products = await Product.findAll({
        where: { is_active: true },
        include: [{ model: Category, as: "category", attributes: ["name"] }],
    });

    if (users.length < 2) {
        console.error("❌ Need at least 2 users in DB.");
        process.exit(1);
    }
    if (products.length === 0) {
        console.error("❌ No products found.");
        process.exit(1);
    }

    console.log(`Found ${users.length} users and ${products.length} products.`);

    await UserProductInteraction.destroy({ where: {} });
    console.log("🗑  Cleared previous interactions.");

    const userA = users.find((u) => u.name.toLowerCase().includes("dara")) || users[0];
    const userB = users.find((u) => u.name.toLowerCase().includes("kk") || u.name.toLowerCase().includes("audit")) || users[1];

    const techProducts = products.filter((p) =>
        /phone|headphone|electronic|cl750|apple|laptop|gadget/i.test(p.name + " " + (p.category?.name || ""))
    );
    const fashionProducts = products.filter((p) =>
        /shoe|dunk|croc|clog|sneaker|fashion|apparel/i.test(p.name + " " + (p.category?.name || ""))
    );

    const fallbackProducts = products;

    const userATargets = techProducts.length ? techProducts : fallbackProducts.slice(0, 2);
    const userBTargets = fashionProducts.length ? fashionProducts : fallbackProducts.slice(-2);

    const records = [];

    // Seed User A (Dara) search and view interactions for Tech/Phone products
    for (const p of userATargets) {
        records.push({
            user_id:          userA.id,
            product_id:       p.id,
            interaction_type: "view",
            weight:           WEIGHTS.view,
        });
        records.push({
            user_id:          userA.id,
            product_id:       p.id,
            interaction_type: "search",
            weight:           WEIGHTS.search,
        });
        records.push({
            user_id:          userA.id,
            product_id:       p.id,
            interaction_type: "cart",
            weight:           WEIGHTS.cart,
        });
    }

    // Seed User B (audit_user / KK) search and view interactions for Shoe/Fashion products
    for (const p of userBTargets) {
        records.push({
            user_id:          userB.id,
            product_id:       p.id,
            interaction_type: "view",
            weight:           WEIGHTS.view,
        });
        records.push({
            user_id:          userB.id,
            product_id:       p.id,
            interaction_type: "search",
            weight:           WEIGHTS.search,
        });
    }

    // Seed remaining users with diverse interaction data to allow rich ML matrix training
    for (const u of users) {
        if (u.id === userA.id || u.id === userB.id) continue;

        for (const p of products) {
            if (Math.random() > 0.4) {
                records.push({
                    user_id:          u.id,
                    product_id:       p.id,
                    interaction_type: "view",
                    weight:           WEIGHTS.view,
                });
            }
        }
    }

    await UserProductInteraction.bulkCreate(records);
    console.log(`✅ Seeded ${records.length} interaction records.`);
    console.log(`   User A (${userA.name}) -> ${userATargets.length} tech/phone products`);
    console.log(`   User B (${userB.name}) -> ${userBTargets.length} shoe/fashion products`);
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
});
