const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');


const loadWishlist = async (req,res) => {
    try {
       const userId = req.session.user;
       const userData = await User.findById(userId);

       const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
       console.log('Wishlist Data : ',wishlist)
       if(!wishlist){
        res.render('wishlist',{isAuthenticated:req.isAuthenticated(),user:userData,wishlist:null});
       }
       res.render('wishlist',{isAuthenticated:req.isAuthenticated(),user:userData,wishlist:wishlist || {products:[]}});
    } catch (error) {
        console.error('Wishlist loading error',error);
        res.status(500).send('Internal server error');
    }
}

const addToWishlist = async (req,res) => {
    try {
        const userId = req.session.user;
        const productsId = req.params.id;
        const products = await Product.findById(productsId);

        if(!products){
            return res.status(404).send('Product not found');
        }

        let wishlist = await Wishlist.findOne({userId});

        if(wishlist){
            const existingProductIndex = wishlist.products.findIndex(product => product.productsId.toString() === productsId);
            if(existingProductIndex > -1){
                return res.json({status:false,message:'Product already in wishlist'});
                
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
        res.json({success:true,message:'Product added in the wishlist successfully'});
    } catch(error) {
        console.error("Error adding product to wishlist",error);
        return res.status(500).json({status:false,message:'Internal server error'});
    }
}

const removeFromWishlist = async (req,res) => {
    try {
        const userId = req.session.user;
        const productsId = req.params.id;

        let wishlist = await Wishlist.findOne({userId});

        if(!wishlist){
            return res.status(404).send('Wishlist not found');
        }

        wishlist.products = wishlist.products.filter(product => product.productsId.toString() !== productsId);

        await wishlist.save();
        res.json({status:true,message:'Product removed successfully from the wishlist'})
    } catch(error) {
        console.error('wishlist product remove error : ',error);
        return res.status(500).json({status:false,message:'Internal server error'});
    }
}
module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist
}