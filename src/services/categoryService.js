const Category = require('../models/categoryModel');

class CategoryService {
  async createCategory(data) {
    return await Category.create(data);
  }

  async getAllCategories() {
    return await Category.findAll({
      order: [['created_at', 'DESC']]
    });
  }

  async getAllCategorys() {
    return await this.getAllCategories();
  }

  async getCategoryById(id) {
    return await Category.findByPk(id);
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
