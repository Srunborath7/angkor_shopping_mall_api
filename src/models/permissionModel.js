const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Permission = sequelize.define('Permission', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // e.g., "products:view", "orders:create"
    },
    module: {
        type: DataTypes.STRING,
        allowNull: false, // e.g., "products", "orders", "dashboard"
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false, // e.g., "view", "create", "update", "delete", "process"
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    tableName: 'permissions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = Permission;
