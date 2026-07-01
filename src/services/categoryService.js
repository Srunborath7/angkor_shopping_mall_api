const Category = require('../models/categoryModel');

class CategoryService {
  async createCategory(data) {
    return await Category.create(data);
  }

  async getAllCategorys() {
    return await Category.findAll();
  }

  async getCategoryById(id) {
    return await Category.findByPk(id);
  }

  async updateCategory(id, data) {
    const Category = await Category.findByPk(id);

    if (!Category) {
      throw new Error('Category not found');
    }

    await Category.update(data);

    return Category;
  }

  async deleteCategory(id) {
    const Category = await Category.findByPk(id);

    if (!Category) {
      throw new Error('Category not found');
    }

    await Category.destroy();

    return true;
  }
}

module.exports = new CategoryService();