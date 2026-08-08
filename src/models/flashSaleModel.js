const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const FlashSale = sequelize.define('FlashSale', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    product_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    category: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    image: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    badge: {
        type: DataTypes.STRING,
        defaultValue: 'Flash Deal',
    },
    originalPrice: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    discount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    stockLimit: {
        type: DataTypes.INTEGER,
        defaultValue: 20,
    },
    claimedPct: {
        type: DataTypes.INTEGER,
        defaultValue: 50,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'active',
    },
    endTime: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    tableName: 'flash_sales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = FlashSale;
