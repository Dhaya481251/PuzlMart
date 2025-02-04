const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');


const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const loadProductpage = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId); // Remove items with null productId
          }

        const category = await Category.find({isListed:true});
        const categoryIds = category.map((category) => category._id.toString());
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categoryIds},
            
        })
        .sort({createdOn:-1}).skip(skip).limit(limit);
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

       console.log('Products page loaded');
       
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

const loadProductDetailspage = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const id = req.params.id;
        await incrementProductView(id);
        await updatePopularityScore(id);
        const product = await Product.findOne({_id:id})
        .populate('category')
        .populate('brand')
        .populate('relatedProducts')
        .populate('reviews')
        .populate('productOffer')
        .exec();
        if(!product){
            console.error(`Product with ID ${id} not found`)
            return res.status(404).send('Product not found');
        }
        const category = await Category.find({isListed:true});
        const brand = await Brand.find({});
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const discount = Math.ceil(((product.regularPrice-product.salePrice)/product.regularPrice)*100);
        res.render('productDetails',{isAuthenticated: req.isAuthenticated(),user:userData,product:product,category:category,brand:brand,relatedProducts:product.relatedProducts || [],cart,discount,wishlist});
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

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

        const products = await Product.find(filter).sort(sortOrder).skip(skip).limit(limit);
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
                quantity: { $gt: 0 },
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


module.exports = {
    loadProductpage,
    loadProductDetailspage,
    filterProductByCategory,
    searchProducts
}