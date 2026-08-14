const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TradeProduct = sequelize.define('TradeProduct', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    category_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    brand_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    condition: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'good',
        // Valid values: 'brand_new', 'like_new', 'good', 'fair', 'poor'
    },
    estimated_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
    },
    trading_preference: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    target_category_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    accept_cash_difference: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    location: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'available',
        // Valid values: 'available', 'in_negotiation', 'traded', 'cancelled'
    },
    image_url: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    image_path: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
    }
}, {
    tableName: 'trade_products',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = TradeProduct;
