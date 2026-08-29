const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const BiometricAuthenticator = sequelize.define("BiometricAuthenticator", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    credential_id: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true
    },
    public_key: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    counter: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    device_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
        defaultValue: 'Fingerprint Sensor / Windows Hello'
    },
    transports: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: ['internal']
    }
}, {
    tableName: 'user_authenticators',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = BiometricAuthenticator;
