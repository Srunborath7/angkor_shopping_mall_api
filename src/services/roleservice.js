const Role = require('../models/roleModel');

class RoleService {
  async createRole(data) {
    const name = (data.name || '').trim();
    if (!name) {
      throw new Error('Role name is required');
    }
    const description = (data.description || data.desc || '').trim() || null;
    return await Role.create({ name, description });
  }

  async getAllRoles() {
    try {
      return await Role.findAll({ order: [['created_at', 'DESC']] });
    } catch (e) {
      return await Role.findAll();
    }
  }

  async getRoleById(id) {
    return await Role.findByPk(id);
  }

  async updateRole(id, data) {
    const role = await Role.findByPk(id);

    if (!role) {
      throw new Error('Role not found');
    }

    await role.update(data);

    return role;
  }

  async deleteRole(id) {
    const role = await Role.findByPk(id);

    if (!role) {
      throw new Error('Role not found');
    }

    await role.destroy();

    return true;
  }
}

module.exports = new RoleService();
