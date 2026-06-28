const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserRole = sequelize.define('UserRole', {
    user_id: {
        type: DataTypes.UUID,
        primaryKey: true
    },
    role_id: {
        type: DataTypes.UUID,
        primaryKey: true
    }
}, {
    tableName: 'user_roles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = UserRole;