const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');
const Review = require('../../models/reviewSchema');


const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dayjs= require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const loadProductpage = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId); // Remove items with null productId
          }

        const category = await Category.find({isListed:true}).populate('categoryOffer');
        const categoryIds = category.map((category) => category._id.toString());
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categoryIds},

        })
        .populate('category')
        .populate('productOffer')
        .populate({
            path: 'category',
            populate: {
                path: 'categoryOffer',
                model: 'Offer'
            }
        })
        .sort({createdOn:-1})
        .skip(skip)
        .limit(limit);

        productData = productData.map(product => {
            const status = product.quantity > 0 ? 'Available' : 'Out of Stock';
            return { ...product.toObject(), status };
        });

        const discount = Math.ceil(((productData.regularPrice-productData.salePrice)/productData.regularPrice)*100);
        const totalProducts = await Product.countDocuments({
            isBlocked:false,
            category:{$in:categoryIds},
        });
        
        const totalPages = Math.ceil(totalProducts/limit);
        const brands = await Brand.find({isBlocked:false});
        const categoriesWithIds = category.map(category => ({_id:category._id,name:category.name}));
       
       res.render('products',{
        isAuthenticated: req.isAuthenticated(),
        user:userData,
        products:productData,
        category:categoriesWithIds,
        brand:brands,
        totalProducts:totalProducts,
        currentPage:page,
        totalPages:totalPages,
        cart,
        wishlist,
        discount,
        appliedFilters:[]
    });



    } catch (error) {
        console.log('Error in loadProductPage',error);
        res.status(500).send('Internal Server Error');
    }
}
const incrementProductView = async(productId) =>{
    await Product.findByIdAndUpdate(productId,{$inc:{views:1}})
}
const updatePopularityScore = async(productId) => {
    const product = await Product.findById(productId);
    await Product.findByIdAndUpdate(productId,{$inc:{popularity:1}});
}

const loadProductDetailspage = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const id = req.params.id;
        await incrementProductView(id);
        await updatePopularityScore(id);
        const category = await Category.find({ isListed: true });
        const categoryIds = category.map((category) => category._id.toString());

        const product = await Product.findOne({ _id: id, category: { $in: categoryIds } })
            .populate('category')
            .populate('brand')
            .populate('relatedProducts')
            .populate('productOffer')
            .populate({
                path: 'category',
                populate: {
                    path: 'categoryOffer',
                    model: 'Offer'
                }
            })
            .populate({
                path: 'relatedProducts',
                populate: {
                    path: 'category', 
                    populate:{
                        path:'categoryOffer',
                        model:'Offer'
                    }
                }
            })
            .populate({
                path: 'relatedProducts',
                populate: {
                    path: 'productOffer', // Nested population for productOffer within relatedProducts
                    model: 'Offer'
                }
            })
            .exec();



        if (!product) {
            console.error(`Product with ID ${id} not found`);
            return res.status(404).send('Product not found');
        }

        // Fetch reviews and format the createdAt dates
        const reviews = await Review.find({ productId: id }).populate('productId').populate('userId');
        const formattedReviews = reviews.map(review => ({
            ...review.toObject(),
            formattedDate: dayjs(review.createdAt).fromNow()
        }));

        const brand = await Brand.find({});
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const wishlist = await Wishlist.findOne({ userId }).populate('products.productsId');
        const discount = Math.ceil(((product.regularPrice - product.salePrice) / product.regularPrice) * 100);
        const totalReviews = await Review.countDocuments({ productId: id });
        const totalRatings = await Review.countDocuments({ productId: id, rating: { $exists: true } });


        res.render('productDetails', {
            isAuthenticated: req.isAuthenticated(),
            user: userData,
            product,
            category,
            brand,
            relatedProducts: product.relatedProducts || [],
            cart,
            discount,
            wishlist,
            reviews: formattedReviews,
            totalReviews,
            totalRatings
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Something went wrong');
    }
};

const filterProductByCategory = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findById(user);
        const cart = await Cart.findOne({ user }).populate('items.productId');
        const wishlist = await Wishlist.findOne({user}).populate('products.productsId');
        const { category, brand, minPrice, maxPrice, sort , query } = req.query;
        let filter = {$or:[{isBlocked:false},{isListed:true}]};
        if (category) {
            const categoriesArray = Array.isArray(category) ? category : [category];
            const categoryDocs = await Category.find({ name: { $in: categoriesArray } });
            const categoryIds = categoryDocs.map((cat) => cat._id);
            filter.category = { $in: categoryIds };
        }
        if (brand) {
            const brandsArray = Array.isArray(brand) ? brand : [brand];
            filter.brand = { $in: brandsArray };
        }
        if (minPrice || maxPrice) {
            filter.salePrice = {};
            if (minPrice) filter.salePrice.$gte = parseInt(minPrice);
            if (maxPrice) filter.salePrice.$lte = parseInt(maxPrice);
        }
        if (query) { 
            filter.productName = { $regex: `.*${query}.*`, $options: "i" };
        }
        let sortOrder = {};
        switch (sort) {
            case 'popularity':
                sortOrder.popularity = -1;
                break;
            case 'priceLowToHigh':
                sortOrder.salePrice = 1;
                break;
            case 'priceHighToLow':
                sortOrder.salePrice = -1;
                break;
            case 'rating':
                sortOrder.averageRating = -1;
                break;
            case 'featured':
                filter.featured = true;
                sortOrder.featured = -1;
                break;
            case 'newArrivals':
                sortOrder.createdOn = -1;
                break;
            case 'aToZ':
                sortOrder.productName = 1;
                break;
            case 'zToA':
                sortOrder.productName = -1;
                break;
            default:
                sortOrder.createdOn = -1;
                break;
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        let products = await Product.find(filter).sort(sortOrder).skip(skip).limit(limit);
        products = products.map(product => {
            const status = product.quantity > 0 ? 'Available' : 'Out of Stock';
            return { ...product.toObject(), status };
        });
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const categories = await Category.find({isListed:true});
        const brands = await Brand.find({ isBlocked: false });
        res.render('products', {
            isAuthenticated: req.isAuthenticated(),
            user: userData,
            products,
            appliedFilters: req.query,
            category: categories,
            brand: brands,
            currentPage: page,
            totalPages: totalPages,
            cart,
            wishlist
        });
    } catch (error) {
        console.error('filter error', error);
        res.status(500).send('Internal Server Error');
    }
}

const searchProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        const cart = await Cart.findOne({ user }).populate('items.productId');
        const wishlist = await Wishlist.findOne({ user }).populate('products.productsId');
        let search = req.body.query || "";
        const brands = await Brand.find({ isBlocked: false }).lean();
        const categories = await Category.find({ isListed: true }).lean();
        const categoryIds = categories.map(category => category._id.toString());
        let searchResult = [];
        if (search.trim().length > 0) {
            searchResult = await Product.find({
                productName: { $regex: `.*${search || ""}.*`, $options: "i" },
                isBlocked: false,
                category: { $in: categoryIds }
            }).lean();
        }
        searchResult.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        let itemsPerPage = 4;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length / itemsPerPage);
        const currentProduct = searchResult.slice(startIndex, endIndex);
        res.render('products', {
            user: userData,
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
            count: searchResult.length,
            wishlist,
            cart,
            appliedFilters: { ...req.query, query: search }
        });
    } catch (error) {
        console.error('search products error', error);
        res.status(500).send('Internal Server Error');
    }
}


const leaveAReview = async(req,res) => {
    try {
        const {productId} = req.params;
        const {rating,review} = req.body;
        const userId = req.session.user;

        if(isNaN(rating) || rating<1 || rating>5){
            return res.status(400).json({message:'Invalid rating. Rating should be a number 1 and 5.',type:'error'});
        }

        const newReview = new Review({
            productId,
            userId,
            review,
            rating
        });

        await newReview.save();

        const product = await Product.findByIdAndUpdate(
            productId,
            {
                $set:{
                    reviews:newReview._id
                }
            },
            {new:true}
        )

        if(product){
            const currentAverageRating = product.averageRating || 0;
            const currentTotalReviews = product.totalReviews || 0;

            const totalRating = currentAverageRating*currentTotalReviews + parseFloat(rating);
            const newTotalReviews = currentTotalReviews + 1;

            product.averageRating = totalRating / newTotalReviews;
            product.totalReviews = newTotalReviews;

            await product.save();
        }

        res.status(200).json({message:'Rating and review added successfully',type:'success'});
    } catch (error) {
        console.error('rating and review added error : ',error);
        res.status(500).json({message:'Internal server error',type:'error'});
    }
}
module.exports = {
    loadProductpage,
    loadProductDetailspage,
    filterProductByCategory,
    searchProducts,
    leaveAReview
}