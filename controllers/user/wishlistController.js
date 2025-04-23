const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");
const Cart = require("../../models/cartSchema");
const Category = require("../../models/categorySchema");

const {StatusCodes,ReasonPhrases} = require('http-status-codes');

const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    res.render("wishlist", { user, cart, category: category, wishlist,appliedFilters:{query:search}});
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const productsId = req.params.id;
    const products = await Product.findById(productsId);

    if (!products) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, error: "Product not found" });
    }

    let wishlist = await Wishlist.findOne({ userId });

    if (wishlist) {
      const existingProductIndex = wishlist.products.findIndex(
        (product) => product.productsId.toString() === productsId
      );
      if (existingProductIndex > -1) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ success: false, message: "Product already in wishlist" });
      } else {
        wishlist.products.push({
          productsId,
        });
      }
    } else {
      wishlist = new Wishlist({
        userId,
        products: [{ productsId }],
      });
    }

    await wishlist.save();
    res.status(StatusCodes.OK).json({
      success: true,
      message: "Product added to the wishlist successfully",
    });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ status: false, message: "Internal server error" });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    const wishlist = await Wishlist.findOne({ userId });
    const productsId = req.params.id;

    if (!wishlist) {
      return res.status(StatusCodes.NOT_FOUND).send("Wishlist not found");
    }

    wishlist.products = wishlist.products.filter(
      (product) => product.productsId.toString() !== productsId
    );

    await wishlist.save();
    res
      .status(StatusCodes.OK)
      .json({ message: "Product removed from wishlist successfully" });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

module.exports = {
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
};
