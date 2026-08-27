const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const RolePermission = sequelize.define('RolePermission', {
    role_id: {
        type: DataTypes.UUID,
        primaryKey: true,
    },
    permission_id: {
        type: DataTypes.UUID,
        primaryKey: true,
    },
}, {
    tableName: 'role_permissions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = RolePermission;
