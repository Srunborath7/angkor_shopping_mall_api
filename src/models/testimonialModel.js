const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Testimonial = sequelize.define('Testimonial', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    author_name: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Customer',
    },
    location: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Phnom Penh',
    },
    rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    avatar_color: {
        type: DataTypes.STRING,
        defaultValue: 'green',
        allowNull: true,
    },
    is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
    },
    is_published: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
    order_index: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
    }
}, {
    tableName: 'testimonials',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = Testimonial;
