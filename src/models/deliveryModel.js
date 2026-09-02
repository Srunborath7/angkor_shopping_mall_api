const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Delivery = sequelize.define('Delivery', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    order_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        comment: 'Associated order reference'
    },
    carrier: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'In-House Courier',
        comment: 'Courier name (Grab, NHAM24, FoodPanda, J&T, VET, In-House)'
    },
    driver_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
        comment: 'Name of the driver or delivery agent'
    },
    driver_phone: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Contact phone number of the driver'
    },
    tracking_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Tracking number or waybill code'
    },
    estimated_time: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Estimated duration or delivery window'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Special delivery instructions or packaging notes'
    },
    status: {
        type: DataTypes.ENUM('assigned', 'in_transit', 'delivered', 'failed', 'returned'),
        defaultValue: 'in_transit',
        allowNull: false,
    },
    dispatched_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
    },
    delivered_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    tableName: 'deliveries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = Delivery;
