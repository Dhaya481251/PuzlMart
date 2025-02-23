const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const Cart = require('../../models/cartSchema');
const Category = require('../../models/categorySchema')

const loadWishlist = async(req,res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
        res.render('wishlist',{user,cart,category:category,wishlist});
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}
const addToWishlist = async (req,res) => {
    try {
        const userId = req.session.user;
        const productsId = req.params.id;
        const products = await Product.findById(productsId);

        if(!products){
            return res.status(400).json({success:false,error:'Product not found'});
        }

        let wishlist = await Wishlist.findOne({userId});

        if(wishlist){
            const existingProductIndex = wishlist.products.findIndex(product => product.productsId.toString() === productsId);
            if(existingProductIndex > -1){
                return res.status(400).json({success:false,message:'Product already in wishlist'});
                
            }else{
                wishlist.products.push({
                    productsId
                });
            }
        }else{
            wishlist = new Wishlist({
                userId,
                products:[
                    {productsId}
                ]
            });
        }

        await wishlist.save();
        res.status(200).json({success:true,message:'Product added to the wishlist successfully'});
    } catch(error) {
        console.error("Error adding product to wishlist",error);
        return res.status(500).json({status:false,message:'Internal server error'});
    }
}

const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('User ID:', userId); // Debug statement

        const wishlist = await Wishlist.findOne({ userId });
        const productsId = req.params.id;
        console.log('Wishlist:', wishlist); // Debug statement
        console.log('Product ID:', productsId); // Debug statement

        if (!wishlist) {
            return res.status(404).send('Wishlist not found');
        }

        wishlist.products = wishlist.products.filter(product => product.productsId.toString() !== productsId);
        console.log('Updated Wishlist Products:', wishlist.products); // Debug statement

        await wishlist.save();
        res.status(200).json({ message: 'Product removed from wishlist successfully' });
    } catch (error) {
        console.error('Error removing product from wishlist:', error);
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist
}