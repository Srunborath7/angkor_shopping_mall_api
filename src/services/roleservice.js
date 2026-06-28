const Role = require('../models/roleModel');

class RoleService {
  async createRole(data) {
    return await Role.create(data);
  }

  async getAllRoles() {
    return await Role.findAll();
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