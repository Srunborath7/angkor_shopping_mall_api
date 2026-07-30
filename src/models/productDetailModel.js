const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ProductDetail = sequelize.define('ProductDetail', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    product_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
    },
    long_description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    specifications: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
    },
    warranty_info: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    shipping_info: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    tableName: 'product_details',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = ProductDetail;
