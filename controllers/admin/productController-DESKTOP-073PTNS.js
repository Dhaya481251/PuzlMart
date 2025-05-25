const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Offer = require("../../models/offerSchema");
const Order = require("../../models/orderSchema");
const Notification = require("../../models/notificationSchema");

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const {StatusCodes,ResponsePhrases} = require('http-status-codes');

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

const fetchProductData = async() => {
  const limit = 4;
  const productData = await Product.find()
  .populate('productOffer')
  .populate('category');

  const count = await Product.find().countDocuments();
  const category = await Category.find({isListed:true});
  const brand = await Brand.find({isBlocked:false});
  const offer = await Offer.find({offerType:'Product'});
  const notifications = await Notification.find({
    notificationType:'returnRequest'
  })
  .populate('orderId')
  .sort({createdOn:-1});

  const totalPages = Math.ceil(count/limit);
  
  return {productData,totalPages,category,brand,offer,notifications}
}

const getProducts = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const search = req.query.search || "";
    const page = req.query.page;
    const limit = 4;

    const productData = await Product.find({
      $or: [
        { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
        { brand: { $regex: new RegExp(".*" + search + ".*", "i") } },
      ],
    })
      .populate("productOffer")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("category")
      .exec();

    const count = await Product.find({
      $or: [
        { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
        { brand: { $regex: new RegExp(".*" + search + ".*", "i") } },
      ],
    }).countDocuments();

    const category = await Category.find({ isListed: true });
    const brand = await Brand.find({ isBlocked: false });
    const offer = await Offer.find({ offerType: "Product" });
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    if (category && brand) {
      res.render("product", {
        data: productData,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        cat: category,
        brand: brand,
        offer: offer,
        notifications,
        errorMessage:null
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).render('product',{errorMessage:'Something went wrong! Please try again.'});
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again.',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const getProductAddPage = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    const category = await Category.find({ isListed: true });
    const brand = await Brand.find({ isBlocked: false });
    const products = await Product.find();
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("add-product", {
      cat: category,
      brand: brand,
      product: products,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

const addProducts = async (req, res) => {
  try {
    const products = req.body;

    const productExists = await Product.findOne({
      productName: {$regex : new RegExp(`^${products.productName}$`,'i') } 
    });

    if (!productExists) {
      const images = [];
      if (req.files && req.files.length > 0) {
        for (let i = 0; i < req.files.length; i++) {
          const originalImagePath = req.files[i].path;
          const resizedImagePath = path.join(
            "public",
            "uploads",
            "product-images",
            req.files[i].filename
          );
          await sharp(originalImagePath)
            .resize({ width: 440, height: 440 })
            .toFile(resizedImagePath);
          images.push(req.files[i].filename);
        }
      }
      const category = await Category.findOne({ name: products.category });
      if (!category) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ message: "Invalid category name", type: "error" });
      }
      if (images.length > 4) {
        return res.status(400).json({
          message: "No. of product should be less than or equal to 4",
          type: "error"
        });
      }
      const newProduct = new Product({
        productName: products.productName,
        description: products.description,
        brand: products.brand,
        category: category._id,
        regularPrice: products.regularPrice,
        salePrice: products.regularPrice,
        createdOn: new Date(),
        quantity: products.quantity,
        productImage: images,
        relatedProducts: products.relatedProducts || [],
      });

      await newProduct.save();

      return res
        .status(StatusCodes.OK)
        .json({ message: "Product added successfully", type: "success" });
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Product already exists. Please try with another name.",
        type: "error",
      });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message:'Something went wrong! Please try again.',type:"error"});
  }
};

const loadAddProductOffer = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    const productId = req.query.id;
    const product = await Product.findOne({ _id: productId }).populate("productOffer");
    if (product.isBlocked === true) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        type: "error",
        message:
          "Product is blocked, so add product offer to this product is not possible",
      });
    }
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("addProductOffer", { product, notifications,errorMessage:null });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

const addProductOffer = async (req, res) => {
  try {
    const { offerType, discountType, value, startDate, endDate } = req.body;
    const productId = req.params.id;

    const findProduct = await Product.findOne({
      _id: productId,
      isBlocked: false,
    }).populate("productOffer")
    .populate({
      path:"category",
      populate:{
        path:"categoryOffer",
        model:"Offer"
      }
    });

    if (!findProduct) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ type: "error", message: "Product not found" });
    }
    if(findProduct.category.categoryOffer){
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ type: "error", message: "Product already has a category offer."})
    }
    
    if (discountType === "Percentage") {
      if (value < 1 || value > 90) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ type: "error", message: "value must be between 1 and 90" });
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
        const discount = Math.floor(findProduct.regularPrice * (value / 100));
        findProduct.salePrice = findProduct.regularPrice - discount;
        findProduct.productOffer = newOffer._id;

        await findProduct.save();

        res
          .status(StatusCodes.OK)
          .json({ type: "success", message: "Offer added successfully" });
      }
    } else if (discountType === "Flat") {
      if (value >= findProduct.regularPrice) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          type: "error",
          message: `value must be less than the least product price ${findProduct.regularPrice}`,
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
        const discount = value;
        findProduct.salePrice = findProduct.regularPrice - discount;
        findProduct.productOffer = newOffer._id;

        await findProduct.save();

        res
          .status(StatusCodes.OK)
          .json({ type: "success", message: "Offer added successfully" });
      }
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ type: "error", message: "Something went wrong! Please try again." });
  }
};

const removeProductOffer = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Product ID is required." });
    }

    const findProduct = await Product.findById(productId).populate(
      "productOffer"
    );
    if (!findProduct) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Product not found." });
    }

    if (findProduct.productOffer) {
      let discount = 0;

      if (findProduct.productOffer.discountType === "Percentage") {
        discount = Math.floor(
          parseFloat(findProduct.regularPrice) *
            (parseFloat(findProduct.productOffer.value) / 100)
        );
      } else if (findProduct.productOffer.discountType === "Flat") {
        discount = parseFloat(findProduct.productOffer.value);
      }

      findProduct.salePrice = (
        parseFloat(findProduct.salePrice) + discount
      ).toFixed(2);

      const offerId = findProduct.productOffer._id;

      findProduct.productOffer.value = 0;
      findProduct.productOffer = null;
      await findProduct.save();

      const removedOffer = await Offer.findByIdAndDelete(offerId);

      return res.status(StatusCodes.OK).json({
        status: true,
        message: "Offer removed successfully.",
        removedOffer,
      });
    } else {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Offer not found for the product." });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ type: "error", message: "Something went wrong! Please try again." });
  }
};

const blockProduct = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    let productId = req.query.id;
    await Product.updateOne({ _id: productId }, { $set: { isBlocked: true } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

const unblockProduct = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    let productId = req.query.id;
    await Product.updateOne({ _id: productId }, { $set: { isBlocked: false } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

const getEditProduct = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    const productId = req.query.id;
    const product = await Product.findOne({ _id: productId });
    const category = await Category.find({});
    const brand = await Brand.find({});
    const products = await Product.find({});
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("edit-product", {
      product: product,
      cat: category,
      brand: brand,
      products: products,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

const editProduct = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    const productId = req.params.id;
    const data = req.body;

    const relatedProducts = Array.isArray(data.relatedProducts)
      ? data.relatedProducts
      : data.relatedProducts
      ? [data.relatedProducts]
      : [];

    const product = await Product.findOne({ _id: productId });
    if (!product) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Product not found" });
    }

    const category = await Category.findOne({ name: data.category });
    if (!category) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid category name" });
    }

    const existingProduct = await Product.findOne({
      productName: data.productName,
      _id: { $ne: productId },
    });
    if (existingProduct) {
      return res.status(400).json({
        error:
          "Product with this name already exists. Please try with another name.",
      });
    }

    const validRelatedProducts = relatedProducts.filter((item) =>
      /^[0-9a-fA-F]{24}$/.test(item)
    );

    const existingRelatedProducts = product.relatedProducts || [];
    const updatedRelatedProducts = [
      ...new Set([...existingRelatedProducts, ...validRelatedProducts]),
    ];

    const images = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        images.push(file.filename);
      });
    }

    const updateFields = {
      productName: data.productName,
      description: data.description,
      brand: data.brand,
      category: category._id,
      regularPrice: data.regularPrice,
      salePrice: data.salePrice,
      quantity: data.quantity,
      relatedProducts: updatedRelatedProducts,
    };
    if (updateFields.quantity > 0) {
      updateFields.status = "Available";
    } else if (updateFields.quantity === 0) {
      updateFields.status = "Out of stock";
    }

    if (images.length > 0) {
      updateFields.productImage = [...product.productImage, ...images];
    }

    await Product.findByIdAndUpdate(productId, updateFields, { new: true });
    res.redirect(StatusCodes.MOVED_TEMPORARILY, "/admin/products");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

const deleteImage = async (req, res) => {
  try {
    const { imageNameToServer, productIdToServer } = req.body;
    const product = await Product.findById(productIdToServer);

    if (!product) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Product not found" });
    }

    product.productImage = product.productImage.filter(
      (image) => image !== imageNameToServer
    );

    await product.save();
    res.status(StatusCodes.OK).json({ status: true });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ status: false });
  }
};

const removeProduct = async (req, res) => {
  try {
    const productId = req.query.id;

    if (!productId) {
      return res.status(StatusCodes.BAD_REQUEST).json({status:false,message:"Product ID is not provided"});
    }
    const result = await Product.deleteOne({ _id: productId });

    if (result.deletedCount === 0) {
      return res.status(StatusCodes.NOT_FOUND).json({status:false,message:"Product not found"});
    }

    return res.status(StatusCodes.OK).json({status:true,message:"Product deleted successfully"});
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ status: false, message: "Internal Server Error" });
  }
};

const featuredProduct = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    let productId = req.query.id;
    await Product.updateOne({ _id: productId }, { $set: { featured: true } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

const unFeaturedProduct = async (req, res) => {
  const {productData,totalPages,category,brand,offer,notifications} = await fetchProductData();
  const page = parseInt(req.query.page) || 1;
  try {
    let productId = req.query.id;

    await Product.updateOne({ _id: productId }, { $set: { featured: false } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('product',{errorMessage:'Something went wrong! Please try again.',data:productData,currentPage:page,totalPages,cat:category,brand,offer,notifications});
  }
};

module.exports = {
  getProducts,
  getProductAddPage,
  addProducts,
  loadAddProductOffer,
  addProductOffer,
  removeProductOffer,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  deleteImage,
  removeProduct,
  featuredProduct,
  unFeaturedProduct,
};
