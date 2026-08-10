const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const CartItem = sequelize.define('CartItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    product_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    variant_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK to product_variants — null if no variant selected',
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    attributes: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'Snapshot of selected variant attributes e.g. {color:"Red",size:"L"}',
    },
}, {
    tableName: 'cart_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = CartItem;
