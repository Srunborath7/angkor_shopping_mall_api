const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const OrderItem = sequelize.define('OrderItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    order_id: {
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
        comment: 'FK to product_variants — the specific variant ordered',
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    attributes: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'Snapshot of the variant attributes at time of order (e.g. {color:"Red", size:"L"})',
    },
}, {
    tableName: 'order_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = OrderItem;
