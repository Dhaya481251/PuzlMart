const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Offer = require("../../models/offerSchema");
const Notification = require("../../models/notificationSchema");

const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const categoryData = await Category.find({})
      .populate("categoryOffer")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);

    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("category", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      notifications,
    });
  } catch (error) {
    res.status(500).send("Internal server error");
  }
};

const loadAddCategory = async (req, res) => {
  try {
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("add-category", { notifications });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const existingCategory = await Category.findOne({ name: name });
    if (existingCategory) {
      return res
        .status(400)
        .json({ message: "Category already exists", type: "error" });
    }

    const categoryImage = `/uploads/re-image/${req.file.filename}`;

    if (!existingCategory) {
      const newCategory = new Category({
        name: name,
        description: description,
        categoryImage: categoryImage,
      });

      await newCategory.save();
      return res
        .status(200)
        .json({ message: "Category added successfully", type: "success" });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

const loadAddCategoryOffer = async (req, res) => {
  try {
    const id = req.query.id;
    const category = await Category.findOne({ _id: id }).populate(
      "categoryOffer"
    );
    if (category.isListed === false) {
      return res.status(400).json({
        type: "error",
        message:
          "Category is unlisted, so add category offer to this category is not possible",
      });
    }
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("addCategoryOffer", { category, notifications });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};
const addCategoryOffer = async (req, res) => {
  try {
    const { offerType, discountType, value, startDate, endDate } = req.body;
    const categoryId = req.params.id;

    const category = await Category.findOne({
      _id: categoryId,
      isListed: true,
    }).populate("categoryOffer");
    if (!category) {
      return res
        .status(404)
        .json({ type: "error", message: "Category not found" });
    }

    let products = await Product.find({ category: categoryId });

    products = products.filter((product) => !product.productOffer);
    if (products.length === 0) {
      return res.status(400).json({
        type: "error",
        message:
          "All products within this category already have product offers",
      });
    }

    if (discountType === "Percentage") {
      if (value < 1 || value > 90) {
        return res
          .status(400)
          .json({ type: "error", message: "Value must be between 1 and 90" });
      } else {
        const newOffer = new Offer({
          offerType: offerType,
          discountType: "Percentage",
          value: value,
          startDate: startDate,
          endDate: endDate,
          isActive: true,
        });
        await newOffer.save();

        products.forEach(async (product) => {
          const discount = product.regularPrice * (value / 100);
          product.salePrice = product.regularPrice - discount;
          product.categoryOffer = newOffer._id;
          await product.save();
        });

        category.categoryOffer = newOffer._id;
        await category.save();

        res
          .status(200)
          .json({ type: "success", message: "Offer added successfully" });
      }
    } else if (discountType === "Flat") {
      const minProductPrice = Math.min(
        ...products.map((product) => product.regularPrice)
      );
      if (value >= minProductPrice) {
        return res.status(400).json({
          type: "error",
          message:
            "Value must be less than the lowest product price in the category",
        });
      } else {
        const newOffer = new Offer({
          offerType: offerType,
          discountType: "Flat",
          value: value,
          startDate: startDate,
          endDate: endDate,
          isActive: true,
        });
        await newOffer.save();

        products.forEach(async (product) => {
          const discount = value;
          product.salePrice = product.regularPrice - discount;
          product.categoryOffer = newOffer._id;
          await product.save();
        });

        category.categoryOffer = newOffer._id;
        await category.save();

        res
          .status(200)
          .json({ type: "success", message: "Offer added successfully" });
      }
    }
  } catch (error) {
    res.status(500).json({ type: "error", message: "Internal Server Error" });
  }
};

const removeCategoryOffer = async (req, res) => {
  try {
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ message: "Category ID is required." });
    }

    const findCategory = await Category.findById(categoryId).populate(
      "categoryOffer"
    );
    if (!findCategory) {
      return res.status(404).json({ message: "Category not found." });
    }

    if (findCategory.categoryOffer) {
      const products = await Product.find({ category: categoryId }).populate(
        "reviews"
      );

      products.forEach(async (product) => {
        let discount = 0;

        if (findCategory.categoryOffer.discountType === "Percentage") {
          discount = Math.floor(
            parseFloat(product.regularPrice) *
              (parseFloat(findCategory.categoryOffer.value) / 100)
          );
        } else if (findCategory.categoryOffer.discountType === "Flat") {
          discount = parseFloat(findCategory.categoryOffer.value);
        }

        product.salePrice = Math.ceil(parseFloat(product.salePrice) + discount);
        console.log(
          "Updated salePrice for product",
          product._id,
          ":",
          product.salePrice
        );

        product.categoryOffer = null;
        await product.save();
      });

      const offerId = findCategory.categoryOffer._id;

      findCategory.categoryOffer.value = 0;
      findCategory.categoryOffer = null;
      await findCategory.save();

      const removedOffer = await Offer.findByIdAndDelete(offerId);

      return res.status(200).json({
        status: true,
        message: "Category offer removed successfully.",
        removedOffer,
      });
    } else {
      return res
        .status(404)
        .json({ message: "Offer not found for the category." });
    }
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
};

const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).send("Category not found");
    }
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("edit-category", { category, notifications });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description } = req.body;
    const existingCategory = await Category.findOne({ name: name });

    if (existingCategory) {
      return res.status(400).json({
        message: "Category already exists. Please choose another name",
        type: "error",
      });
    }

    let categoryImage = req.body.existingCategoryImage;
    if (req.file) {
      categoryImage = `/uploads/re-image/${req.file.filename}`;
    }

    const updateCategory = await Category.findByIdAndUpdate(
      id,
      { name: name, description: description, categoryImage: categoryImage },
      { new: true }
    );

    if (updateCategory) {
      return res
        .status(200)
        .json({ message: "Category updated successfully", type: "success" });
    } else {
      return res
        .status(404)
        .json({ message: "Category not found", type: "error" });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", type: "error" });
  }
};

const removeCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const removedCategory = await Category.findByIdAndDelete(id);

    if (!removedCategory) {
      res.status(404).json({ status: false, message: "Category not found" });
    }

    return res
      .status(200)
      .json({ message: "Category deleted successfully", removedCategory });
  } catch (error) {
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

module.exports = {
  categoryInfo,
  loadAddCategory,
  addCategory,
  loadAddCategoryOffer,
  addCategoryOffer,
  removeCategoryOffer,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  removeCategory,
};
