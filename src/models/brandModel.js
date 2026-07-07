const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Brand = sequelize.define('Brand', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },

    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },

    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },

    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    }

}, {
    tableName: 'brands',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = Brand;