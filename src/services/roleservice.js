const { Op } = require('sequelize');
const Role = require('../models/roleModel');
const Permission = require('../models/permissionModel');
const RolePermission = require('../models/rolePermissionModel');

const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

class RoleService {
    // Helper to resolve input permissions into Permission records
    async _resolvePermissions(rawPermissions) {
        if (!rawPermissions) return [];

        let permNamesOrIds = [];

        // If stringified JSON
        if (typeof rawPermissions === 'string') {
            try {
                rawPermissions = JSON.parse(rawPermissions);
            } catch (e) {
                rawPermissions = [rawPermissions];
            }
        }

        if (Array.isArray(rawPermissions)) {
            for (const item of rawPermissions) {
                if (typeof item === 'string') {
                    permNamesOrIds.push(item);
                } else if (item && typeof item === 'object') {
                    if (item.name) permNamesOrIds.push(item.name);
                    else if (item.id) permNamesOrIds.push(item.id);
                    else if (item.module && item.action) permNamesOrIds.push(`${item.module}:${item.action}`);
                }
            }
        } else if (typeof rawPermissions === 'object') {
            // Legacy format { products: ["view", "create"], orders: ["view"] }
            for (const [mod, actions] of Object.entries(rawPermissions)) {
                if (Array.isArray(actions)) {
                    for (const act of actions) {
                        permNamesOrIds.push(`${mod}:${act}`);
                    }
                }
            }
        }

        if (permNamesOrIds.length === 0) return [];

        const uuidList = permNamesOrIds.filter(isUUID);
        const nameList = permNamesOrIds.filter(s => !isUUID(s));

        const conditions = [];
        if (uuidList.length > 0) conditions.push({ id: { [Op.in]: uuidList } });
        if (nameList.length > 0) conditions.push({ name: { [Op.in]: nameList } });

        if (conditions.length === 0) return [];

        // Find permissions matching IDs or Names
        const found = await Permission.findAll({
            where: conditions.length === 1 ? conditions[0] : { [Op.or]: conditions },
            raw: true
        });

        return found;
    }

    _formatRole(role, permissionsList = []) {
        if (!role) return null;
        const plain = role.toJSON ? role.toJSON() : { ...role };
        const perms = (permissionsList || plain.permissions || []).map(p => (typeof p === 'string' ? p : p.name || `${p.module}:${p.action}`));
        return {
            id: plain.id,
            name: plain.name,
            description: plain.description,
            permissions: perms,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }

    async createRole(data) {
        const name = (data.name || '').trim();
        if (!name) {
            throw new Error('Role name is required');
        }
        const description = (data.description || data.desc || '').trim() || null;

        const role = await Role.create({ name, description });

        if (data.permissions !== undefined) {
            const permissionsToAssign = await this._resolvePermissions(data.permissions);
            if (permissionsToAssign.length > 0) {
                const rpRecords = permissionsToAssign.map(p => ({
                    role_id: role.id,
                    permission_id: p.id
                }));
                await RolePermission.bulkCreate(rpRecords, { ignoreDuplicates: true });
            }
        }

        return await this.getRoleById(role.id);
    }

    async getAllRoles() {
        const roles = await Role.findAll({
            order: [['created_at', 'DESC']],
            raw: true
        });

        const rps = await RolePermission.findAll({ raw: true });
        const perms = await Permission.findAll({ raw: true });

        const permMap = new Map();
        perms.forEach(p => permMap.set(p.id, p.name || `${p.module}:${p.action}`));

        const rolePermsMap = new Map();
        rps.forEach(rp => {
            if (!rolePermsMap.has(rp.role_id)) rolePermsMap.set(rp.role_id, []);
            const pName = permMap.get(rp.permission_id);
            if (pName) rolePermsMap.get(rp.role_id).push(pName);
        });

        return roles.map(r => this._formatRole(r, rolePermsMap.get(r.id) || []));
    }

    async getRoleById(id) {
        const role = await Role.findByPk(id, { raw: true });
        if (!role) return null;

        const rps = await RolePermission.findAll({
            where: { role_id: id },
            raw: true
        });

        const permIds = rps.map(rp => rp.permission_id);
        let permNames = [];
        if (permIds.length > 0) {
            const perms = await Permission.findAll({
                where: { id: { [Op.in]: permIds } },
                raw: true
            });
            permNames = perms.map(p => p.name || `${p.module}:${p.action}`);
        }

        return this._formatRole(role, permNames);
    }

    async updateRole(id, data) {
        const role = await Role.findByPk(id);

        if (!role) {
            throw new Error('Role not found');
        }

        const updateData = {};
        if (data.name !== undefined) updateData.name = String(data.name).trim();
        if (data.description !== undefined) updateData.description = data.description;
        if (data.desc !== undefined) updateData.description = data.desc;

        await role.update(updateData);

        if (data.permissions !== undefined) {
            const permissionsToAssign = await this._resolvePermissions(data.permissions);
            await RolePermission.destroy({ where: { role_id: id } });
            if (permissionsToAssign.length > 0) {
                const rpRecords = permissionsToAssign.map(p => ({
                    role_id: id,
                    permission_id: p.id
                }));
                await RolePermission.bulkCreate(rpRecords, { ignoreDuplicates: true });
            }
        }

        return await this.getRoleById(id);
    }

    async deleteRole(id) {
        const role = await Role.findByPk(id);

        if (!role) {
            throw new Error('Role not found');
        }

        await RolePermission.destroy({ where: { role_id: id } });
        await role.destroy();

        return true;
    }

    async getAllPermissions() {
        const permissions = await Permission.findAll({
            order: [['module', 'ASC'], ['action', 'ASC']],
            raw: true
        });

        const grouped = {};
        for (const p of permissions) {
            if (!grouped[p.module]) {
                grouped[p.module] = [];
            }
            grouped[p.module].push({
                id: p.id,
                name: p.name,
                action: p.action,
                description: p.description
            });
        }

        return {
            flat: permissions.map(p => ({
                id: p.id,
                name: p.name,
                module: p.module,
                action: p.action,
                description: p.description
            })),
            grouped
        };
    }
}

module.exports = new RoleService();
