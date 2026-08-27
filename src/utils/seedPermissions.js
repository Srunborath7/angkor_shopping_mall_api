const Role = require('../models/roleModel');
const Permission = require('../models/permissionModel');
const RolePermission = require('../models/rolePermissionModel');

const DEFAULT_PERMISSIONS = [
    // Dashboard
    { module: 'dashboard', action: 'view', description: 'View dashboard analytics and statistics' },
    
    // Products
    { module: 'products', action: 'view', description: 'View products list and details' },
    { module: 'products', action: 'create', description: 'Create new products' },
    { module: 'products', action: 'update', description: 'Edit existing products' },
    { module: 'products', action: 'delete', description: 'Delete products' },
    
    // Categories
    { module: 'categories', action: 'view', description: 'View categories' },
    { module: 'categories', action: 'create', description: 'Create new categories' },
    { module: 'categories', action: 'update', description: 'Edit categories' },
    { module: 'categories', action: 'delete', description: 'Delete categories' },

    // Brands
    { module: 'brands', action: 'view', description: 'View brands' },
    { module: 'brands', action: 'create', description: 'Create new brands' },
    { module: 'brands', action: 'update', description: 'Edit brands' },
    { module: 'brands', action: 'delete', description: 'Delete brands' },

    // Flash Sale
    { module: 'flash_sale', action: 'view', description: 'View flash sales' },
    { module: 'flash_sale', action: 'create', description: 'Create flash sale events' },
    { module: 'flash_sale', action: 'update', description: 'Edit flash sale events' },
    { module: 'flash_sale', action: 'delete', description: 'Delete flash sale events' },

    // Trading
    { module: 'trading', action: 'view', description: 'View trade listings and offers' },
    { module: 'trading', action: 'create', description: 'Create trade listings' },
    { module: 'trading', action: 'update', description: 'Update trade listings' },
    { module: 'trading', action: 'delete', description: 'Delete trade listings' },
    { module: 'trading', action: 'approve', description: 'Approve or reject trade offers' },

    // Orders
    { module: 'orders', action: 'view', description: 'View orders' },
    { module: 'orders', action: 'create', description: 'Create orders' },
    { module: 'orders', action: 'update', description: 'Update orders' },
    { module: 'orders', action: 'process', description: 'Process order status updates' },
    { module: 'orders', action: 'cancel', description: 'Cancel orders' },

    // Messages / Support
    { module: 'messages', action: 'view', description: 'View support messages' },
    { module: 'messages', action: 'reply', description: 'Reply to customer messages' },
    { module: 'messages', action: 'delete', description: 'Delete support messages' },

    // Inventory
    { module: 'inventory', action: 'view', description: 'View stock and inventory' },
    { module: 'inventory', action: 'update', description: 'Update stock levels' },

    // Purchases
    { module: 'purchases', action: 'view', description: 'View purchase orders' },
    { module: 'purchases', action: 'create', description: 'Create purchase orders' },
    { module: 'purchases', action: 'update', description: 'Update purchase orders' },
    { module: 'purchases', action: 'delete', description: 'Delete purchase orders' },

    // Suppliers
    { module: 'suppliers', action: 'view', description: 'View suppliers' },
    { module: 'suppliers', action: 'create', description: 'Create suppliers' },
    { module: 'suppliers', action: 'update', description: 'Edit suppliers' },
    { module: 'suppliers', action: 'delete', description: 'Delete suppliers' },

    // Attendance
    { module: 'attendance', action: 'view', description: 'View attendance records' },
    { module: 'attendance', action: 'checkin', description: 'Perform check-in/check-out' },
    { module: 'attendance', action: 'approve', description: 'Approve leave requests and attendance corrections' },

    // Customers
    { module: 'customers', action: 'view', description: 'View customer accounts' },
    { module: 'customers', action: 'create', description: 'Create customer profiles' },
    { module: 'customers', action: 'update', description: 'Edit customer profiles' },
    { module: 'customers', action: 'delete', description: 'Delete customer profiles' },

    // Reports
    { module: 'reports', action: 'view', description: 'View business reports' },
    { module: 'reports', action: 'export', description: 'Export business reports' },

    // Settings
    { module: 'settings', action: 'view', description: 'View system settings' },
    { module: 'settings', action: 'update', description: 'Update system settings' },

    // Roles & Permissions
    { module: 'roles', action: 'view', description: 'View roles and permissions' },
    { module: 'roles', action: 'create', description: 'Create roles' },
    { module: 'roles', action: 'update', description: 'Edit roles and permissions' },
    { module: 'roles', action: 'delete', description: 'Delete roles' },

    // Users
    { module: 'users', action: 'view', description: 'View user accounts' },
    { module: 'users', action: 'create', description: 'Create user accounts' },
    { module: 'users', action: 'update', description: 'Edit user accounts' },
    { module: 'users', action: 'delete', description: 'Delete user accounts' },
];

async function seedPermissions() {
    console.log('[RBAC Seeder] Seeding permissions into database...');

    const permRows = DEFAULT_PERMISSIONS.map(item => ({
        name: `${item.module}:${item.action}`,
        module: item.module,
        action: item.action,
        description: item.description,
    }));

    await Permission.bulkCreate(permRows, {
        updateOnDuplicate: ['module', 'action', 'description']
    });

    const allPerms = await Permission.findAll();
    console.log(`[RBAC Seeder] Total ${allPerms.length} permissions available in DB.`);

    const permMap = {};
    for (const p of allPerms) {
        permMap[p.name] = p.id;
    }

    const roleDefinitions = {
        admin: Object.keys(permMap),
        manager: [
            'dashboard:view',
            'products:view', 'products:create', 'products:update', 'products:delete',
            'categories:view', 'categories:create', 'categories:update', 'categories:delete',
            'brands:view', 'brands:create', 'brands:update', 'brands:delete',
            'flash_sale:view', 'flash_sale:create', 'flash_sale:update', 'flash_sale:delete',
            'trading:view', 'trading:create', 'trading:update', 'trading:approve',
            'orders:view', 'orders:process', 'orders:update',
            'messages:view', 'messages:reply',
            'inventory:view', 'inventory:update',
            'purchases:view', 'purchases:create', 'purchases:update',
            'suppliers:view', 'suppliers:create', 'suppliers:update',
            'attendance:view', 'attendance:checkin', 'attendance:approve',
            'customers:view', 'customers:create', 'customers:update',
            'reports:view', 'reports:export',
            'settings:view',
            'users:view',
            'roles:view'
        ],
        staff: [
            'dashboard:view',
            'products:view',
            'orders:view', 'orders:process',
            'attendance:view', 'attendance:checkin',
            'inventory:view',
            'messages:view', 'messages:reply'
        ],
        customer: []
    };

    const rolePermRows = [];
    for (const [roleName, permNames] of Object.entries(roleDefinitions)) {
        let [role] = await Role.findOrCreate({
            where: { name: roleName },
            defaults: {
                name: roleName,
                description: `${roleName.charAt(0).toUpperCase() + roleName.slice(1)} role`
            }
        });

        const targetPermIds = permNames.map(name => permMap[name]).filter(Boolean);
        for (const permId of targetPermIds) {
            rolePermRows.push({
                role_id: role.id,
                permission_id: permId
            });
        }
    }

    if (rolePermRows.length > 0) {
        await RolePermission.bulkCreate(rolePermRows, {
            ignoreDuplicates: true
        });
    }

    console.log('[RBAC Seeder] Roles and role_permissions synchronized successfully.');
}

module.exports = {
    DEFAULT_PERMISSIONS,
    seedPermissions
};
