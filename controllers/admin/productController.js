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

const getProducts = async (req, res) => {
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
        totalPages: page,
        totalPages: Math.ceil(count / limit),
        cat: category,
        brand: brand,
        offer: offer,
        notifications,
      });
    } else {
      res.status(404).send("Page not found");
    }
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const getProductAddPage = async (req, res) => {
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
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const addProducts = async (req, res) => {
  try {
    const products = req.body;

    const productExists = await Product.findOne({
      productName: products.productName,
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
          .status(400)
          .json({ message: "Invalid category name", type: "error" });
      }
      if (images.length > 4) {
        return res.status(400).json({
          message: "No. of product should be less than or equal to 4",
          type: "error",
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
        .status(200)
        .json({ message: "Product added successfully", type: "success" });
    } else {
      return res.status(400).json({
        message: "Product already exist. Please try with another name.",
        type: "error",
      });
    }
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
};

const loadAddProductOffer = async (req, res) => {
  try {
    const id = req.query.id;
    const product = await Product.findOne({ _id: id }).populate("productOffer");
    if (product.isBlocked === true) {
      return res.status(400).json({
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
    res.render("addProductOffer", { product, notifications });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const addProductOffer = async (req, res) => {
  try {
    const { offerType, discountType, value, startDate, endDate } = req.body;
    const productId = req.params.id;

    const findProduct = await Product.findOne({
      _id: productId,
      isBlocked: false,
    }).populate("productOffer");

    if (!findProduct) {
      return res
        .status(404)
        .json({ type: "error", message: "Product not found" });
    }
    if (discountType === "Percentage") {
      if (value < 1 || value > 90) {
        return res
          .status(400)
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
          .status(200)
          .json({ type: "success", message: "Offer added successfully" });
      }
    } else if (discountType === "Flat") {
      if (value >= findProduct.regularPrice) {
        return res.status(400).json({
          type: "error",
          message: "value must be less than product price",
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
          .status(200)
          .json({ type: "success", message: "Offer added successfully" });
      }
    }
  } catch (error) {
    res.status(500).json({ type: "error", message: "Internal Server Error" });
  }
};

const removeProductOffer = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required." });
    }

    const findProduct = await Product.findById(productId).populate(
      "productOffer"
    );
    if (!findProduct) {
      return res.status(404).json({ message: "Product not found." });
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

      return res.status(200).json({
        status: true,
        message: "Offer removed successfully.",
        removedOffer,
      });
    } else {
      return res
        .status(404)
        .json({ message: "Offer not found for the product." });
    }
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
};

const blockProduct = async (req, res) => {
  try {
    let id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const unblockProduct = async (req, res) => {
  try {
    let id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id;
    const product = await Product.findOne({ _id: id });
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
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const editProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;

    const relatedProducts = Array.isArray(data.relatedProducts)
      ? data.relatedProducts
      : data.relatedProducts
      ? [data.relatedProducts]
      : [];

    const product = await Product.findOne({ _id: id });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const category = await Category.findOne({ name: data.category });
    if (!category) {
      return res.status(400).json({ error: "Invalid category name" });
    }

    const existingProduct = await Product.findOne({
      productName: data.productName,
      _id: { $ne: id },
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

    await Product.findByIdAndUpdate(id, updateFields, { new: true });
    res.redirect(302, "/admin/products");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const deleteImage = async (req, res) => {
  try {
    const { imageNameToServer, productIdToServer } = req.body;
    const product = await Product.findById(productIdToServer);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    product.productImage = product.productImage.filter(
      (image) => image !== imageNameToServer
    );

    await product.save();
    res.json({ status: true });
  } catch (error) {
    res.status(500).json({ status: false });
  }
};

const removeProduct = async (req, res) => {
  try {
    const id = req.query.id;

    if (!id) {
      return res.status(400).send("Product ID is not provided");
    }
    const result = await Product.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return res.status(404).send("Product not found");
    }

    return res.status(200).send("Product deleted successfully");
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

const featuredProduct = async (req, res) => {
  try {
    let id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { featured: true } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const unFeaturedProduct = async (req, res) => {
  try {
    let id = req.query.id;

    await Product.updateOne({ _id: id }, { $set: { featured: false } });
    res.redirect("/admin/products");
  } catch (error) {
    res.status(500).send("Internal Server Error");
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
