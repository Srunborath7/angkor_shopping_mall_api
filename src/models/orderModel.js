const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    total_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pending', 'paid', 'failed', 'shipped', 'completed', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false,
    },
    payment_intent_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    shipping_address: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    contact_phone: {
        type: DataTypes.STRING,
        allowNull: false,
    }
}, {
    tableName: 'orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = Order;
