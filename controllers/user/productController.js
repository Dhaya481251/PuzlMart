const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');



const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const loadProductpage = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        

        const category = await Category.find({isListed:true});
        const categoryIds = category.map((category) => category._id.toString());
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categoryIds},
            quantity:{$gt:0},
            
        })
        .sort({createdOn:-1}).skip(skip).limit(limit);

        const totalProducts = await Product.countDocuments({
            isBlocked:false,
            category:{$in:categoryIds},
            quantity:{$gt:0}
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
        totalPages:totalPages
    });

       console.log('Products page loaded');
       
    } catch (error) {
        console.log('Error in loadProductPage',error);
        res.status(500).send('Internal Server Error');
    }
}

const loadProductDetailspage = async(req,res) => {
    try {
        const id = req.params.id;
        const product = await Product.findOne({_id:id})
        .populate('category')
        .populate('brand')
        .populate('relatedProducts')
        .populate('reviews')
        .exec();
        if(!product){
            console.error(`Product with ID ${id} not found`)
            return res.status(404).send('Product not found');
        }
        const category = await Category.findOne({});
        const brand = await Brand.find({});
        
        
        res.render('productDetails',{isAuthenticated: req.isAuthenticated(),user:req.session.user,product:product,cat:category,brand:brand,relatedProducts:product.relatedProducts || []});
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const filterProduct = async(req,res) => {
    try {
        const user = req.session.user;
        const category = req.query.category;
        const brand = req.query.brand;

        const findCategory = category ? await Category.findOne({_id:category}) : null;
        const findBrand = brand ? await Brand.findOne({_id:brand}) : null;
        
        const brands = await Brand.find({}).lean();

        const query = {
            isBlocked:false,
            quantity:{$gt:0}
        }

        if(findCategory){
            query.category = findCategory._id;
        }

        if(findBrand){
            query.brand = findBrand.brandName;
        }
        console.log(findBrand);
        let findProducts = await Product.find(query).lean();

        findProducts.sort((a,b) =>  new Date(b.createdOn) - new Date(a.createdOn));
        
        const categories = await Category.find({isListed:true});
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;

        let startIndex = (currentPage - 1)*itemsPerPage;
        let endIndex = startIndex+itemsPerPage;
        let totalPages = Math.ceil(findProducts.length/itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);
        let userData = null;

        if(user){
            userData = await User.findOne({_id:user});
            if(userData){
                const searchEntry = {
                    category : findCategory ? findCategory._id : null,
                    brand : findBrand ? findBrand.brandName : null,
                    searchedOn : new Date()
                }
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        req.session.filteredProducts = currentProduct;
        res.render('products',{
            user:userData,
            products:currentProduct,
            category:categories,
            brand:brands,
            totalPages,
            currentPage,
            selectedCategory:category || null,
            selectedBrand:brand || null
        })
    } catch (error) {
        console.error('filter error',error);
        res.status(500).send('Internal Server Error');
    }
}

const filterByPrice = async(req,res) => {
    try {
        
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        const brands = await Brand.find({}).lean();
        const categories = await Category.find({isListed:true}).lean();
        
        let findProducts = await Product.find({
            salePrice:{$gt:req.query.gt,$lt:req.query.lt},
            isBlocked:false,
            quantity:{$gt:0}
        }).lean();

        findProducts.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));

        let itemsPerPage = 6;
        let currentPage = parseInt (req.query.page) || 1;
        let startIndex = (currentPage - 1)*itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length/itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);
        req.session.filteredProducts = findProducts;

        res.render('products',{
            user:userData,
            products:currentProduct,
            category:categories,
            brand:brands,
            totalPages,
            currentPage,
        })
    } catch (error) {
        console.error('filter price error',error);
        res.status(500).send('Internal Server Error');
    }
}

const searchProducts = async(req,res) =>  {
    try {
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        let search = req.body.query || "";
        console.log('Search Query : ',search);
        
        const brands = await Brand.find({}).lean();
        const categories = await Category.find({isListed:true}).lean();
        const categoryIds = categories.map(category => category._id.toString());
        let searchResult = [];
        
    if(search.trim().length > 0){
        if(req.session.filteredProducts && req.session.filteredProducts.length>0){
            searchResult = req.session.filteredProducts.filter(product =>
                product.productName && product.productName.toLowerCase().includes(search?.toLowerCase() || "")
            );
            
        }else{
            searchResult = await Product.find({
                productName: {$regex:`.*${search || ""}.*`,$options:"i"},
                isBlocked:false,
                quantity:{$gt:0},
                category:{$in:categoryIds}
            }).lean();
        }
    }

        searchResult.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));

        let itemsPerPage = 6;
        let currentPage = parseInt (req.query.page) || 1;
        let startIndex = (currentPage - 1)*itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length/itemsPerPage);
        const currentProduct = searchResult.slice(startIndex,endIndex);
        
        res.render('products',{
            user:userData,
            products:currentProduct,
            category:categories,
            brand:brands,
            totalPages,
            currentPage,
            count:searchResult.length
        })
    } catch (error) {
        console.error('search products error',error);
        res.status(500).send('Internal Server Error');
    }
}

const sortFilter = async(req,res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        const brands = await Brand.find({}).lean();
        const categories = await Category.find({isListed:true}).lean();

        const sort = req.query.sort;

    let filterConditions = {
        isBlocked:false,
        quantity:{$gt:0}
    };

    let sortConditions = {};

if (sort === 'popularity') {
  sortConditions = { popularity: -1 };
}
if (sort === 'lowToHigh') {
  sortConditions = {salePrice:1} ;
}
if (sort === 'highToLow') {
  sortConditions = {salePrice:-1} ;
}
if (sort === 'averageRatings') {
  sortConditions = { averageRating: -1 };
}
if (sort === 'featured'){
  sortConditions = { featured : true };
}
if (sort === 'newArrivals') {
  sortConditions = { createdOn: -1 };
}
if (sort === 'aToZ') {
  sortConditions = {productName:1};
}
if (sort === 'zToA') {
  sortConditions = {productName:-1};
}

    
    const totalProducts = await Product.countDocuments(filterConditions);
    let products = await Product.find(filterConditions)
    .sort(sortConditions)
    .lean();
    
    let itemsPerPage = 6;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1)*itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(totalProducts/itemsPerPage);
    let currentProduct = products.slice(startIndex,endIndex);
    req.session.filteredProducts = products;
    
    res.render('products',{
        user:userData,
        products:currentProduct,
        category:categories,
        brand:brands,
        totalPages,
        currentPage,
    });
    } catch (error) {
        console.error('sorting error',error);
        res.status(500).send('Internal server error');
    }
}


module.exports = {
    loadProductpage,
    loadProductDetailspage,
    filterProduct,
    filterByPrice,
    searchProducts,
    sortFilter,
}