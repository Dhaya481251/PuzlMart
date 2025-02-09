const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require("../../models/brandSchema");
const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema');

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const getProducts = async(req,res) => {
    try {
        const search = req.query.search || '';
        const page = req.query.page;
        const limit = 4;

        const productData = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
                {brand:{$regex:new RegExp(".*"+search+".*","i")}}
            ]
        })
        .populate('productOffer')
        .limit(limit*1)
        .skip((page-1)*limit)
        .populate('category')
        .exec();

        const count = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
                {brand:{$regex:new RegExp(".*"+search+".*","i")}}
            ]
        }).countDocuments();

        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});
        const offer = await Offer.find({offerType:'Product'});

        if(category&& brand){
            res.render('product',{
                data:productData,
                currentPage:page,
                totalPages:page,
                totalPages:Math.ceil(count/limit),
                cat:category,
                brand:brand,
                offer:offer
            })
        }else{
            res.status(404).send('Page not found');
        }
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const getProductAddPage = async(req,res) => {
    try {
        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});
        const products = await Product.find();
        res.render('add-product',{cat:category,brand:brand,product:products})
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
} 

const addProducts = async(req,res) => {
    try {
        console.log('add products post request');
        const products = req.body;
        console.log('product data : ',products);
        console.log('brand : ',products.brand);
        console.log('category : ',products.category);
        
        const productExists = await Product.findOne({
            productName: products.productName
        })

        if(!productExists){
            const images = [];
            if(req.files && req.files.length>0){
                for(let i=0 ; i<req.files.length ; i++){
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.join('public','uploads','product-images',req.files[i].filename);
                    await sharp(originalImagePath)
                    .resize({width:440,height:440})
                    .toFile(resizedImagePath);
                    images.push(req.files[i].filename);
                }
            }
            const category = await Category.findOne({name:products.category});
            if(!category){
                return res.status(400).json('Invalid category name');
            }
            if(images.length>4){
                return res.status(400).json('No. of product should be less than or equal to 4')
            }
            const newProduct = new Product({
                productName:products.productName,
                description:products.description,
                brand:products.brand,
                category:category._id,
                regularPrice:products.regularPrice,
                salePrice:products.regularPrice,
                createdOn:new Date(),
                quantity:products.quantity,
                productImage:images,
                status:'Available',
                relatedProducts:products.relatedProducts || []
            });

            await newProduct.save();
            return res.redirect('/admin/products');
        }else{
            return res.status(400).json('Product already exist. Please try with another name.');
        }
    } catch (error) {
        console.error('Error saving products : ',error);
        return res.status(500).send('Internal Server Error');
    }
}

const loadAddProductOffer = async (req,res) => {
    try {
        const id = req.query.id;
        const product = await Product.findOne({_id:id});
        res.render('addProductOffer',{product});
    } catch (error) {
        console.error('Error while loading add product offer page : ',error);
        res.status(500).send('Internal Server Error')
    }
}

const addProductOffer = async (req, res) => {
    try {
        const {offerType,discounType,value,startDate,endDate } = req.body;
        const productId = req.params.id;
        const findProduct = await Product.findOne({_id:productId}).populate('productOffer');
        
        if (!findProduct) {
            return res.status(404).json({ status: false, message: 'Product not found' });
        }
        if(discounType === 'Percentage'){
            if (value < 1 || value > 100) {
                return res.status(400).json({ status: false, message: 'value must be between 1 and 100' });
            }else{
                const newOffer = new Offer({
                    offerType: offerType,
                    discountType: 'Percentage',
                    value:value,
                    startDate: startDate,
                    endDate: endDate, 
                    isActive: true
                });
                await newOffer.save();
                const discount = Math.floor(findProduct.regularPrice * (value / 100));;
                findProduct.salePrice = findProduct.regularPrice-discount;
                findProduct.productOffer = newOffer._id;

                await findProduct.save();

                res.status(200).json({ status: true, message: 'Offer added successfully' });
            }
        }else{
            if(value>findProduct.regularPrice){
                return res.status(400).json({status:false,message:'value must be less than product price'});
            }else{
                const newOffer = new Offer({
                    offerType: offerType,
                    discountType: 'Flat',
                    value:value,
                    startDate: startDate,
                    endDate: endDate, 
                    isActive: true
                });
                await newOffer.save();
                const discount = value;
                findProduct.salePrice = findProduct.regularPrice-discount;
                findProduct.productOffer = newOffer._id;

                await findProduct.save();

                res.status(200).json({ status: true, message: 'Offer added successfully' });
            }
        }


    } catch (error) {
        console.error('Error in addProductOffer:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
};


const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ message: 'Product ID is required.' });
        }

        const findProduct = await Product.findById(productId);
        const removedOffer = await Offer.findByIdAndDelete(findProduct.productOffer);
        if (!findProduct) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        if (findProduct.productOffer && findProduct.productOffer.value) {
            
            findProduct.salePrice += Math.floor(
                findProduct.regularPrice * (findProduct.productOffer.value / 100)
            );
            findProduct.productOffer.value= 0;
            findProduct.productOffer = null; 
            await findProduct.save();
        } 

        await findProduct.save();

        res.status(200).json({ status: true, message: 'Offer removed successfully.',removedOffer });
    } catch (error) {
        console.error('Product offer removing error:', error);
        res.status(500).send('Internal Server Error');
    }
};


const blockProduct = async(req,res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/products");
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const unblockProduct = async(req,res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect("/admin/products");
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const getEditProduct = async(req,res) => {
    try {
        const id = req.query.id;
        const product = await Product.findOne({_id:id});
        const category =await Category.find({});
        const brand = await Brand.find({});
        const products = await Product.find({});
        
        res.render('edit-product',{
            product:product,
            cat:category,
            brand:brand,
            products:products
        })
    } catch (error) {
        res.status(500).send('Internal Server Error')
    }
}

const editProduct = async (req, res) => {
    try {
      const id = req.params.id;
      const data = req.body;
  
      // Ensure relatedProducts are treated as an array
      const relatedProducts = Array.isArray(data.relatedProducts)
        ? data.relatedProducts
        : data.relatedProducts
        ? [data.relatedProducts]
        : [];
  
      const product = await Product.findOne({ _id: id });
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
  
      const category = await Category.findOne({ name: data.category });
      if (!category) {
        return res.status(400).json({ error: "Invalid category name" });
      }
  
      const existingProduct = await Product.findOne({
        productName: data.productName,
        _id: { $ne: id },
      });
      if (existingProduct) {
        return res
          .status(400)
          .json({ error: "Product with this name already exists. Please try with another name." });
      }
  
      // Filter relatedProducts to include only valid ObjectId strings
      const validRelatedProducts = relatedProducts.filter((item) =>
        /^[0-9a-fA-F]{24}$/.test(item)
      );
  
      // Combine existing and new relatedProducts
      const existingRelatedProducts = product.relatedProducts || [];
      const updatedRelatedProducts = [...new Set([...existingRelatedProducts, ...validRelatedProducts])];
  
      const images = [];
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => {
          images.push(file.filename);
        });
      }
  
      // Define fields to update
      const updateFields = {
        productName: data.productName,
        description: data.description,
        brand: data.brand,
        category: category._id,
        regularPrice: data.regularPrice,
        salePrice: data.salePrice,
        quantity: data.quantity,
        relatedProducts: updatedRelatedProducts,
      };
  
      // Handle images if uploaded
      if (images.length > 0) {
        updateFields.images = images;
      }
  
      await Product.findByIdAndUpdate(id, updateFields, { new: true });
      res.redirect("/admin/products");
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
    }
  };
  

const deleteImage = async(req,res) => {
    try {
        const {imageNameToServer,productIdToServer} = req.body;
        const product = await Product.findByIdAndUpdate(productIdToServer,{$pull:{productImage:imageNameToServer}});
        const imagePath = path.join('public','uploads','re-image',imageNameToServer);

        if(fs.existsSync(imagePath)){
            await fs.unlinkSync(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
        }else{
            console.log(`Image ${imageNameToServer} not found`);
        }
        res.send({status:true});
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const removeProduct = async (req, res) => {
    try {
        const id = req.query.id;
        console.log(`Removing product with ID: ${id}`);
        if(!id){
            return res.status(400).send('Product ID is not provided');
        }
        const result = await Product.deleteOne({_id:id});

        if (result.deletedCount === 0) {
            console.log('Product not found');
            return res.status(404).send('Product not found' );
        }

        console.log('Product deleted successfully');
        return res.status(200).send('Product deleted successfully');
    } catch (error) {
        console.error('Error removing product : ', error);
        return res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
};

const featuredProduct = async(req,res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{featured:true}});
        res.redirect("/admin/products");
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const unFeaturedProduct = async(req,res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{featured:false}});
        res.redirect("/admin/products");
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const searchProduct = async (req, res) => {
  try {
    const searchString = req.body.query;
    let page =1;
    if(req.query.page){
      page = req.query.page;
    }
    const limit = 3;

    const products = await Product.find({
        productName:{$regex:searchString,$options:"i"},
    })
    .limit(limit*1)
    .skip((page-1)*limit)
    .exec();

    const count = await Product.find({
      productName:{$regex:searchString,$options:"i"}
    }).countDocuments();
    
    res.render("product", {
        data:products,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      });
    console.log(orders);
  } catch (error) {
    console.log('Error while searching user : ', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
    getProducts,
    getProductAddPage,
    addProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteImage,
    removeProduct,
    featuredProduct,
    unFeaturedProduct,
    searchProduct,
    loadAddProductOffer
}