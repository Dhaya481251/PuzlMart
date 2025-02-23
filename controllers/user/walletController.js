const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const Category = require('../../models/categorySchema');

const loadWallet = async(req,res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
        res.render('wallet',{user,cart,wishlist,category:category});
    } catch (error) {
        console.error('Loading wallet page error',error);
        res.status(500).send('Internal Server Error');
    }
}

module.exports = {
    loadWallet
}