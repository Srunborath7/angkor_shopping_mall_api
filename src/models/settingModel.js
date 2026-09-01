const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Setting = sequelize.define(
    "Setting",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        key: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        value: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    },
    {
        tableName: "settings",
        timestamps: true,
        underscored: true
    }
);

module.exports = Setting;
