const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Offer = require('../../models/offerSchema');


const categoryInfo = async(req,res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const categoryData = await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories/limit);

        res.render('category',{
            cat:categoryData,
            currentPage:page,
            totalPages:totalPages,
            totalCategories:totalCategories
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error');
    }
}

const loadAddCategory = async(req,res) => {
    try {
        res.render('add-category');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const addCategory = async (req, res) => {
    try {
        console.log(req.body);
        const { name, description } = req.body;

        
        const existingCategory = await Category.findOne({ name:name });
        if (existingCategory) {
             res.status(400).json({ message: 'Category already exists' ,type:'error'});
        }

        
        const categoryImage = `/uploads/re-image/${req.file.filename}`;

        if(!existingCategory){
        const newCategory = new Category({
            name:name,
            description:description,
            categoryImage:categoryImage,
        });
    
        await newCategory.save();
        return res.status(200).json({ message: 'Category added successfully',type:'success'});
    }
    } catch (error) {
        console.error('Error while adding category:', error);
         res.status(500).json({message: 'Internal server error',type:'error'});
    }
};


const addCategoryOffer = async(req,res) => {
    try {
        const percentage = parseInt(req.body.percentage);
        const categoryId = req.body.categoryId;
        console.log('Category Id : ',categoryId);
        console.log('Offer Percentage',percentage);

        if (percentage < 1 || percentage > 100) {
            return res.json({ status: false, message: 'Percentage must be between 1 and 100' });
        }

        const category = await Category.findById(categoryId);

        if(!category){
            return res.status(404).json({status:false,message:'Category not found'});
        }
        const products = await Product.find({category:category._id});
        const hasProductOffer = products.some((product) => product.productOffer > percentage);

        if(hasProductOffer){
            return res.json({status:false,message:'Products within this category already have product offers'});
        }
        const offer = await Offer.findById(categoryId);
        const newOffer = new Offer({
            offerType:'Category',
            discountType:'Percentage',
            startDate:new Date(),
            endDate:new Date(Date.now() + 7*24*60*60*100),
            isActive:true
        })
        await Category.updateOne({_id:categoryId},{$set:{categoryOffer:percentage}});
        newOffer.value = (percentage/100);
        await newOffer.save();
        const discount = Math.floor(roducts.regularPrice*(percentage/100));
        products.salePrice = products.regularPrice -discount;
        products.categoryOffer = newOffer._id;
        for(const product of products){
            product.productOffer = 0;
            products.salePrice = product.regularPrice;
            await product.save();
        }
        res.json({status:true});
    } catch (error) {
        console.error('Error in addCategoryOffer : ',error);
        res.status(500).json({status:false,message:'Internal Server Error'});
    }
}

const removeCategoryOffer = async(req,res) => {
    try {
        const categoryId = req.body.categoryId;
        const category = await Category.findById(categoryId);

        if(!category){
            return res.status(404).json({status:false,message:'Category not found'})
        }

        const percentage = category.categoryOffer;
        const products = await Product.find({category:category._id});

        if(products.length > 0){
            for(const product of products){
                product.salePrice += Math.floor(product.regularPrice*(percentage/1000));
                product.productOffer = 0;
                await product.save();
            }
        }

        category.categoryOffer.value = 0;
        await category.save();
        res.json({status:true});

    } catch (error) {
        res.status(500).json({status:false,message:'Internal Server Error'});
    }
}

const getListCategory = async(req,res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}});
        res.redirect('/admin/category');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const getUnlistCategory = async(req,res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:true}});
        res.redirect('/admin/category');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const getEditCategory = async(req,res) => {
    try {
        const id = req.query.id;
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).send('Category not found');
        }
        res.render('edit-category',{category});
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error')
    }
}

const editCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, description } = req.body;
        const existingCategory = await Category.findOne({ name: name });

        if (existingCategory && existingCategory._id.toString() !== id) { 
             res.status(400).json({ 
                message: 'Category already exists. Please choose another name', 
                type: 'error' 
            });
        }

        let categoryImage = req.body.existingCategoryImage;
        if (req.file) {
            categoryImage = `/uploads/re-image/${req.file.filename}`;
        }

        const updateCategory = await Category.findByIdAndUpdate(
            id,
            { name: name, description: description, categoryImage: categoryImage },
            { new: true }
        );

        if (updateCategory) {
            
             res.status(200).json({ message: 'Category updated successfully',type:'success' });
        } else {
             res.status(404).json({ message: 'Category not found',type:'error' });
        }
    } catch (error) {
        console.error("Error while updating category:", error);
        res.status(500).json({ message: 'Internal Server Error',type:'error' });
    }
};

const removeCategory = async(req,res) => {
    try {
        const id = req.params.id;
        const removedCategory = await Category.findByIdAndDelete(id);
        
        if(!removedCategory){
            res.status(404).json({status:false,message:'Category not found'});
        }

        return res.status(200).json({message:'Category deleted successfully',removedCategory})
    } catch (error) {
        console.error('Error removing category : ',error);
        res.status(500).json({status:false,message:'Internal Server Error'});
    }
}

module.exports = {
    categoryInfo,
    loadAddCategory,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
    removeCategory
}