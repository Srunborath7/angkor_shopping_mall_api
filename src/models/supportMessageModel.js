const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SupportMessage = sequelize.define('SupportMessage', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    sender_name: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Customer',
    },
    sender_email: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    sender_phone: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    subject: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'General Inquiry',
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    sender_type: {
        type: DataTypes.ENUM('user', 'admin', 'bot'),
        defaultValue: 'user',
        allowNull: false,
    },
    admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('unread', 'in_progress', 'replied', 'closed'),
        defaultValue: 'unread',
        allowNull: false,
    },
    sentiment: {
        type: DataTypes.STRING,
        defaultValue: 'inquiry',
        allowNull: true,
    },
    ai_summary: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    ai_suggested_reply: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    admin_reply: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    replied_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    tableName: 'support_messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = SupportMessage;
