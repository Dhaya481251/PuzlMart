const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const Brand = require('../../models/brandSchema');

const loadCategoryItems = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);

        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const categories = await Category.find({isListed:true})
        const id = req.params.id;
        const selectedCategory = await Category.findOne({_id:id,isListed:true});
        if(!selectedCategory){
            res.status(400).send('Category not found');
        };
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        let productData = await Product.find({category:{$in:id},isBlocked:false})
        .populate('category')
        .populate('productOffer')
        .populate({
            path:'category',
            populate:{
                path:'categoryOffer',
                model:'Offer'
            }
        })
        .sort({createdOn:-1})
        .skip(skip)
        .limit(limit);

        productData = productData.map((product) => {
            const status = product.quantity > 0 ? 'Available':'Out of Stock';
            return {...product.toObject(),status};
        });

        const discount = Math.ceil(((productData.regularPrice - productData.salePrice)/productData.regularPrice)*100);

        const totalProducts = await Product.countDocuments({
            isBlocked:false,
            category:{$in:id}
        });

        const totalPages = Math.ceil(totalProducts/limit);
        const brands = await Brand.find({isBlocked:false});

        res.render('categoryItems',{user:userData,category:categories,selectedCategory,products:productData,brand:brands,totalProducts:totalProducts,currentPage:page,totalPages:totalPages,cart,wishlist,discount,appliedFilters:[]});
    } catch (error) {
        console.error('Error while loading categoryItems : ',error);
        res.status(500).send('Internal Server Error');
    }
}

const filterProducts = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findById(user);
    const cart = await Cart.findOne({ user }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ user }).populate("products.productsId");
    const id = req.params.id;

    const selectedCategory = await Category.findOne({ _id: id, isListed: true });
    if (!selectedCategory) {
      return res.status(400).render("errorPage", { message: "Category not found" });
    }

    // Extract and sanitize query parameters
    const { brand, minPrice, maxPrice, sort, query } = req.query;
    const filter = { isBlocked: false, category: { $in: id } };
    if (brand) {
      filter.brand = { $in: Array.isArray(brand) ? brand : [brand] };
    }
    if (minPrice || maxPrice) {
      filter.salePrice = {};
      if (minPrice) filter.salePrice.$gte = parseInt(minPrice);
      if (maxPrice) filter.salePrice.$lte = parseInt(maxPrice);
    }
    if (query) {
      filter.productName = { $regex: `.*${query}.*`, $options: "i" };
    }

    const sortOrder = {};
    switch (sort) {
      case "popularity":
        sortOrder.popularity = -1;
        break;
      case "priceLowToHigh":
        sortOrder.salePrice = 1;
        break;
      case "priceHighToLow":
        sortOrder.salePrice = -1;
        break;
      case "rating":
        sortOrder.averageRating = -1;
        break;
      case "featured":
        filter.featured = true;
        sortOrder.featured = -1;
        break;
      case "newArrivals":
        sortOrder.createdOn = -1;
        break;
      case "aToZ":
        sortOrder.productName = 1;
        break;
      case "zToA":
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

    const categories = await Category.find({ isListed: true });
    const brands = await Brand.find({ isBlocked: false });

    res.render("categoryItems", {
      user: userData,
      products: products.map((product) => ({
        ...product.toObject(),
        status: product.quantity > 0 ? "Available" : "Out of Stock",
      })),
      appliedFilters: { brand, minPrice, maxPrice, sort, query },
      category: categories,
      selectedCategory,
      brand: brands,
      currentPage: page,
      totalPages,
      cart,
      wishlist,
    });
  } catch (error) {
    console.error("Error while filtering products:", error);
    res.status(500).render("errorPage", { message: "Something went wrong. Please try again later." });
  }
};

module.exports = {
    loadCategoryItems,
    filterProducts
}