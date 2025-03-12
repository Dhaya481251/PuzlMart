const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Wishlist = require("../../models/wishlistSchema");

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
    const user = await User.findById(userId);
    let cart = await Cart.findOne({ userId }).populate("items.productId");
    const category = await Category.find({ isListed: true });
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );

    if (cart && cart.items) {
      cart.items = cart.items.filter(
        (item) => item.productId && !item.productId.isBlocked
      );

      if (cart.items.length > 0) {
        return res.render("cart", { user, cart, category, wishlist });
      }
    }

    res.render("cart", { user, cart: { items: [] }, category, wishlist });
  } catch (error) {
    res.status(500).send("Internal Server Error");
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
        .status(400)
        .json({ success: false, error: "Product not found" });
    }

    if (quantityToAdd > product.quantity) {
      return res.status(400).json({ success: false, error: "Out of Stock" });
    }

    let cart = await Cart.findOne({ userId });

    if (cart) {
      const existingItemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId
      );

      if (existingItemIndex > -1) {
        const existingItem = cart.items[existingItemIndex];
        if (existingItem.quantity + quantityToAdd > product.quantity) {
          return res.status(400).json({
            success: false,
            error: "Cannot add more than available stock",
          });
        }
        if (existingItem.quantity + quantityToAdd > 10) {
          return res
            .status(400)
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

    res.status(200).json({
      success: true,
      message: "Product added to the cart successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).send("Cart not found");
    }

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );

    await cart.save();
    res.status(200).json({
      items: cart.items,
      total: cart.items.reduce(
        (acc, item) => acc + item.productId.salePrice * item.quantity,
        0
      ),
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const increaseQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ error: "cart not found" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );
    if (!item) return res.status(404).json({ error: "Item not in cart" });

    if (item.quantity + 1 > product.quantity) {
      return res
        .status(400)
        .json({ error: "Cannot add more than available stock" });
    }

    item.quantity += 1;
    item.productId.discount = product.regularPrice - product.salePrice;

    if (item.quantity > 10) {
      item.quantity = 10;
      return res.status(400).json({ error: "You can buy maximum 10 products" });
    }
    await cart.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

const decreaseQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ error: "cart not found" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );
    if (!item) return res.status(404).json({ error: "Item not in cart" });

    if (item.quantity + 1 > product.quantity) {
      return res
        .status(400)
        .json({ error: "Cannot add more than available stock" });
    }

    item.quantity -= 1;
    item.productId.discount = product.regularPrice - product.salePrice;

    if (item.quantity < 1) {
      return res.status(400).json({ error: "You can buy min 1 products" });
    }
    await cart.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  loadCart,
  addToCart,
  removeFromCart,
  increaseQuantity,
  decreaseQuantity,
};
