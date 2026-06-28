const User = require('./userModel');
const Role = require('./roleModel');
const UserRole = require('./userRoleModel');
const RefreshToken = require('./refreshTokenModel');

User.belongsToMany(Role, {
    through: UserRole,
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'roles'
});

Role.belongsToMany(User, {
    through: UserRole,
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'users'
});

User.hasMany(RefreshToken, {
    foreignKey: 'user_id',
    as: 'refreshTokens',
    onDelete: 'CASCADE'
});

RefreshToken.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

module.exports = {
    User,
    Role,
    UserRole,
    RefreshToken
};