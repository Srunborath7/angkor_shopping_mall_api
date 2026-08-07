const Category = require('../models/categoryModel');
const User = require('../models/userModel');

class CategoryService {
  async createCategory(data) {
    return await Category.create(data);
  }

  async getAllCategorys() {
    return await Category.findAll({
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'updater', attributes: ['id', 'name', 'email'] }
      ]
    });
  }

  async getCategoryById(id) {
    return await Category.findByPk(id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'updater', attributes: ['id', 'name', 'email'] }
      ]
    });
  }

  async updateCategory(id, data) {
    const category = await Category.findByPk(id);

    if (!category) {
      throw new Error('Category not found');
    }

    await category.update(data);

    return await this.getCategoryById(id);
  }

  async deleteCategory(id) {
    const category = await Category.findByPk(id);

    if (!category) {
      throw new Error('Category not found');
    }

    await category.destroy();

    return true;
  }
}

module.exports = new CategoryService();