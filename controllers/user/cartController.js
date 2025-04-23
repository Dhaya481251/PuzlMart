const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Wishlist = require("../../models/wishlistSchema");

const {StatusCodes,ReasonPhrases} = require('http-status-codes');

const incrementProductPurchase = async (productId) => {
  await Product.findByIdAndUpdate(productId, { $in: { purchases: 1 } });
};
const updatePopularityScore = async (productId) => {
  const product = await Product.findById(productId);
  await Product.findByIdAndUpdate(productId, { $inc: { popularity: 1 } });
};

const loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const user = await User.findById(userId);
    let cart = await Cart.findOne({ userId }).populate("items.productId");
    const category = await Category.find({ isListed: true });
    const wishlist = await Wishlist.findOne({ userId }).populate("products.productsId");
    
    if (cart && cart.items) {
      cart.items = cart.items.filter(
        (item) => item.productId && !item.productId.isBlocked
      );

      if (cart.items.length > 0) {
        return res.render("cart", { user, cart, category, wishlist ,appliedFilters:{query:search} });
      }
    }
    cart.items = cart.items.filter(item => !item.productId.isBlocked);
    
    if (cart.items.length === 0) {
          return res.redirect(StatusCodes.MOVED_TEMPORARILY, "/products");
    }
    res.render("cart", { user, cart: { items: [] }, category, wishlist ,appliedFilters:{query:search}});
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Something went wrong! Please try again.');
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;
    const quantityToAdd = parseInt(req.body.quantity) || 1;
    await incrementProductPurchase(productId);
    await updatePopularityScore(productId);
    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "Product not found" });
    }

    if (quantityToAdd > product.quantity) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: "Out of Stock" });
    }

    if(product.isBlocked === true){
      return res.status(StatusCodes.BAD_REQUEST).json({success:false,error:'Access Denied. Please contact Admin'});
    }

    let cart = await Cart.findOne({ userId });

    if (cart) {
      const existingItemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId
      );

      if (existingItemIndex > -1) {
        const existingItem = cart.items[existingItemIndex];
        if (existingItem.quantity + quantityToAdd > product.quantity) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            error: "Cannot add more than available stock",
          });
        }
        if (existingItem.quantity + quantityToAdd > 10) {
          return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ success: false, error: "You can buy max 10 products" });
        }

        existingItem.quantity += quantityToAdd;
        existingItem.productId.discount =
          product.regularPrice - product.salePrice;
        existingItem.totalPrice = existingItem.quantity * product.salePrice;
      } else {
        cart.items.push({
          productId,
          quantity: quantityToAdd,
        });
      }
    } else {
      cart = new Cart({
        userId,
        items: [
          {
            productId,
            quantity: quantityToAdd,
          },
        ],
      });
    }

    await cart.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Product added to the cart successfully",
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(StatusCodes.NOT_FOUND).send("Cart not found");
    }

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );

    await cart.save();
    res.status(StatusCodes.OK).json({
      items: cart.items,
      total: cart.items.reduce(
        (acc, item) => acc + item.productId.salePrice * item.quantity,
        0
      ),
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const increaseQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "cart not found" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(StatusCodes.NOT_FOUND).json({ error: "Product not found" });

    if(product.isBlocked === true){
      return res.status(StatusCodes.BAD_REQUEST).json({error:'Access Denied. Please contact Admin'});
    }

    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );
    if (!item) return res.status(StatusCodes.NOT_FOUND).json({ error: "Item not in cart" });

    if (item.quantity + 1 > product.quantity) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Cannot add more than available stock" });
    }

    item.quantity += 1;
    item.productId.discount = product.regularPrice - product.salePrice;

    if (item.quantity > 10) {
      item.quantity = 10;
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "You can buy maximum 10 products" });
    }
    await cart.save();
    res.status(StatusCodes.OK).json({ success: true });
  } catch (error) {
    
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
};

const decreaseQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "cart not found" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(StatusCodes.NOT_FOUND).json({ error: "Product not found" });

    if(product.isBlocked === true){
      return res.status(StatusCodes.BAD_REQUEST).json({error:'Access Denied. Please contact Admin'});
    }

    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );
    if (!item) return res.status(StatusCodes.NOT_FOUND).json({ error: "Item not in cart" });

    if (item.quantity + 1 > product.quantity) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Cannot add more than available stock" });
    }

    item.quantity -= 1;
    item.productId.discount = product.regularPrice - product.salePrice;

    if (item.quantity < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "You can buy min 1 products" });
    }
    await cart.save();
    res.status(StatusCodes.OK).json({ success: true });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
};

module.exports = {
  loadCart,
  addToCart,
  removeFromCart,
  increaseQuantity,
  decreaseQuantity,
};
