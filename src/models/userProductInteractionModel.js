const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserProductInteraction = sequelize.define(
    'UserProductInteraction',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },

        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },

        product_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },

        interaction_type: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },

        weight: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 1,
        },

        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        tableName: 'user_product_interactions',
        timestamps: false,
    }
);

module.exports = UserProductInteraction;