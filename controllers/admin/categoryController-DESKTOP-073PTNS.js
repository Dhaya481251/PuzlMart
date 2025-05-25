const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Offer = require("../../models/offerSchema");
const Notification = require("../../models/notificationSchema");
const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");

const {StatusCodes,ReasonPhrases} = require('http-status-codes');

const fetchDashboardData = async() => {
  const users = await User.find({isAdmin:false});
  const orders = await Order.find()
  .sort({createdOn:-1})
  .populate('items.productId')
  .populate('userId');
  const products = await Product.find();
  const notifications = await Notification.find({notificationType:'returnRequest'})
  .populate('orderId')
  .sort({createdOn:-1});

  const topSellingProducts = await Order.aggregate([
    {$unwind:'$items'},
    {$group:{_id:'$items.productId',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'products',localField:'_id',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'}
  ]);
  const topSellingCategories = await Order.aggregate([
    {$unwind:'$items'},
    {$lookup:{from:'products',localField:'items.productId',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'},
    {$group:{_id:'$productDetails.category',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'categories',localField:'_id',foreignField:'_id',as:'categoryDetails'}},
    {$unwind:'$categoryDetails'},
    {$project:{_id:'$categoryDetails',totalQuantitySold:1}}
  ])

  const topSellingBrands = await Order.aggregate([
    {$unwind:'$items'},
    {$lookup:{from:'products',localField:'items.productId',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'},
    {$group:{_id:'$productDetails.brand',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'brands',localField:'_id',foreignField:'brandName',as:'brandDetails'}},
    {$unwind:'$brandDetails'},
    {$project:{brandName:'$_id',brandImage:'$brandDetails.brandImage',totalQuantitySold:1}}
  ])
  return {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands};
};

const fetchCategoryData = async() => {
  const limit = 4;
  const categoryData = await Category.find()
  .populate("categoryOffer")
  .sort({createdOn:-1});

  const totalCategories = await Category.countDocuments();
  const totalPages = Math.ceil(totalCategories/limit);

  const notifications = await Notification.find({notificationType:'returnRequest'})
  .populate("orderId")
  .sort({createdOn:-1});

  return {categoryData,totalCategories,totalPages,notifications};
}

const categoryInfo = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = fetchDashboardData();
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const categoryData = await Category.find()
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
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again.',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const loadAddCategory = async (req, res) => {
  const {categoryData,totalCategories,totalPages,notifications} = await fetchCategoryData();
  const page = parseInt(req.query.page) || 1;
  try {
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("add-category", { notifications ,errorMessage:null});
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('category',{errorMessage:'Something went wrong! Please try again.',currentPage:page,cat:categoryData,totalCategories,totalPages,notifications});
  }
};

const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res
        .status(StatusCodes.BAD_REQUEST)
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
        .status(StatusCodes.OK)
        .json({ message: "Category added successfully", type: "success" });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong! Please try again.", type: "error" });
  }
};

const loadAddCategoryOffer = async (req, res) => {
  const {categoryData,totalCategories,totalPages,notifications} = await fetchCategoryData();
  const page = parseInt(req.query.page) || 1
  try {
    const categoryId = req.query.id;
    const category = await Category.findOne({ _id: categoryId }).populate(
      "categoryOffer"
    );
    if (category.isListed === false) {
      return res.status(StatusCodes.BAD_REQUEST).json({
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
    res.render("addCategoryOffer", { category, notifications,errorMessage:null });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('category',{errorMessage:'Something went wrong! Please try again.',currentPage:page,cat:categoryData,totalCategories,totalPages,notifications});
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
        .status(StatusCodes.NOT_FOUND)
        .json({ type: "error", message: "Category not found" });
    }

    let products = await Product.find({ category: categoryId });

    products = products.filter((product) => !product.productOffer);
    if (products.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        type: "error",
        message:
          "All products within this category already have product offers",
      });
    }

    if (discountType === "Percentage") {
      if (value < 1 || value > 90) {
        return res
          .status(StatusCodes.BAD_REQUEST)
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
          .status(StatusCodes.OK)
          .json({ type: "success", message: "Offer added successfully" });
      }
    } else if (discountType === "Flat") {
      const minProductPrice = Math.min(
        ...products.map((product) => product.regularPrice)
      );
      if (value >= minProductPrice) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          type: "error",
          message:
            `Value must be less than the least product price ${minProductPrice} in the category`,
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
          .status(StatusCodes.OK)
          .json({ type: "success", message: "Offer added successfully" });
      }
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ type: "error", message: 'Something went wrong! Please try again.' });
  }
};

const removeCategoryOffer = async (req, res) => {
  const {categoryData,totalCategories,totalPages,notifications} = await fetchCategoryData();
  const page = parseInt(req.query.page) || 1;
  try {
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Category ID is required." });
    }

    const findCategory = await Category.findById(categoryId).populate(
      "categoryOffer"
    );
    if (!findCategory) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Category not found." });
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

        product.categoryOffer = null;
        await product.save();
      });

      const offerId = findCategory.categoryOffer._id;

      findCategory.categoryOffer.value = 0;
      findCategory.categoryOffer = null;
      await findCategory.save();

      const removedOffer = await Offer.findByIdAndDelete(offerId);

      return res.status(StatusCodes.OK).json({
        status: true,
        message: "Category offer removed successfully.",
        removedOffer,
      });
    } else {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Offer not found for the category." });
    }
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({status:false,message:'Something went wrong! Please try again.'})
  }
};

const getListCategory = async (req, res) => {
  const {categoryData,totalCategories,totalPages,notifications} = await fetchCategoryData();
  const page = parseInt(req.query.page) || 1;
  try {
    let categoryId = req.query.id;
    await Category.updateOne({ _id: categoryId }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('category',{errorMessage:'Something went wrong! Please try again.',currentPage:page,cat:categoryData,totalCategories,totalPages,notifications});
  }
};

const getUnlistCategory = async (req, res) => {
  const {categoryData,totalCategories,totalPages,notifications} = await fetchCategoryData();
  const page = parseInt(req.query.page) || 1;
  try {
    let categoryId = req.query.id;
    await Category.updateOne({ _id: categoryId }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('category',{errorMessage:'Something went wrong! Please try again.',currentPage:page,cat:categoryData,totalCategories,totalPages,notifications});
  }
};

const getEditCategory = async (req, res) => {
  const {categoryData,totalCategories,totalPages,notifications} = await fetchCategoryData();
  const page = parseInt(req.query.page) || 1;
  try {
    const categoryId = req.query.id;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(StatusCodes.NOT_FOUND).render('edit-category',{errorMessage:'Something went wrong! Please try again.',category, notifications});
    }
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("edit-category", { category, notifications,errorMessage:null });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('category',{errorMessage:'Something went wrong! Please try again.',currentPage:page,cat:categoryData,totalCategories,totalPages,notifications});
  }
};

const editCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { name, description } = req.body;
    const existingCategory = await Category.findOne({ name: name });

    if (existingCategory) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Category already exists. Please choose another name",
        type: "error",
      });
    }

    let categoryImage = req.body.existingCategoryImage;
    if (req.file) {
      categoryImage = `/uploads/re-image/${req.file.filename}`;
    }

    const updateCategory = await Category.findByIdAndUpdate(
      categoryId,
      { name: name, description: description, categoryImage: categoryImage },
      { new: true }
    );

    if (updateCategory) {
      return res
        .status(StatusCodes.OK)
        .json({ message: "Category updated successfully", type: "success" });
    } else {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Category not found", type: "error" });
    }
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong! Please try again.', type: "error" });
  }
};

const removeCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const removedCategory = await Category.findByIdAndDelete(categoryId);

    if (!removedCategory) {
      res.status(StatusCodes.NOT_FOUND).json({ status: false, message: "Category not found" });
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: "Category deleted successfully", removedCategory });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ status: false, message: 'Something went wrong! Please try again.' });
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
