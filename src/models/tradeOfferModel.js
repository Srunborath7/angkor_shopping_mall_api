const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TradeOffer = sequelize.define('TradeOffer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    trade_product_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    sender_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    receiver_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    offered_product_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    offered_item_title: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    offered_item_description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    offered_cash_difference: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    contact_info: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'pending',
        // Valid values: 'pending', 'accepted', 'rejected', 'cancelled', 'completed'
    },
    status_note: {
        type: DataTypes.TEXT,
        allowNull: true,
    }
}, {
    tableName: 'trade_offers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = TradeOffer;
