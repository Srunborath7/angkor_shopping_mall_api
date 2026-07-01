const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Role = sequelize.define('Category',{
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
    note: {
        type: DataTypes.STRING,
        allowNull: true,
    }
  },
  {
    tableName: 'categories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = Role;