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
    subtotal_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
        comment: 'Cart subtotal before discounts or trade-in deductions',
    },
    trade_in_discount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
        comment: 'Discount applied from TradeProduct trade-in',
    },
    trade_in_product_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Reference to TradeProduct applied for trade-in discount',
    },
    status: {
        type: DataTypes.ENUM('pending', 'paid', 'failed', 'shipped', 'completed', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false,
    },
    payment_method: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'KHQR',
        comment: 'Payment method selected (KHQR, ABA_PAY, COD, VISA_MASTER)',
    },
    currency: {
        type: DataTypes.STRING(10),
        allowNull: true,
        defaultValue: 'USD',
    },
    payment_intent_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    khqr_string: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    khqr_md5: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
    khqr_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    transaction_hash: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    paid_at: {
        type: DataTypes.DATE,
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
