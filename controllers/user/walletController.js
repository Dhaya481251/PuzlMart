const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const Category = require("../../models/categorySchema");

const {StatusCodes,ReasonPhrases} = require('http-status-codes');

const loadWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const transactions =
      user.wallet && user.wallet.transactions
        ? user.wallet.transactions.slice(skip, skip + limit)
        : [];

    const totalTransactions = user.wallet ? user.wallet.transactions.length : 0;
    const totalPages = Math.ceil(totalTransactions / limit);

    res.render("wallet", {
      user,
      cart,
      wishlist,
      category,
      transactions,
      currentPage: page,
      totalPages,
      appliedFilters:{query:search}
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

module.exports = {
  loadWallet,
};
