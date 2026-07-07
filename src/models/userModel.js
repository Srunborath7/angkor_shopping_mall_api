const {DataTypes} = require('sequelize')
const sequelize = require('../config/db')

const User = sequelize.define("User",{
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
    email:{
         type: DataTypes.STRING(255),
        allowNull: false,
        unique: true, 
    },
    password:{
        type: DataTypes.STRING,
        allowNull: false
    },
    phone:{
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    telegram_chat_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    }
},{
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
module.exports = User;