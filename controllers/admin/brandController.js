const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');


const getBrandPage = async(req,res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;
        const brandData = await Brand.find({}).sort({createdAt:-1}).skip(skip).limit(limit);
        const totalBrands = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrands/limit);
        const reverseBrand = brandData.reverse();

        res.render('brands',{
            data:reverseBrand,
            currentPage:page,
            totalPages:totalPages,
            totalBrands:totalBrands
        })
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const addBrand = async(req,res) => {
    try {
        const {name} = req.body;
        const findBrand = await Brand.findOne({brandName:name});
        if(findBrand){
            return res.status(400).json({message:'Brand already exists',type:'error'});
        }
        if(!findBrand){
            const image = req.file.filename;
            const newBrand = new Brand({
                brandName:name,
                brandImage:image
            })
            await newBrand.save();
            return res.status(200).json({message:'Brand added successfully',type:'success'})
        }
    } catch (error) {
        res.status(500).json({message:'Internal Server Error',type:'error'});
    }
}

const blockBrand = async(req,res) => {
    try {
        const id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect('/admin/brands');
    } catch (error) {
        res.status(500).send('Internal Server Error')
    }
}

const unblockBrand = async(req,res) => {
    try {
        const id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect('/admin/brands');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const deleteBrand = async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) {
            return res.status(400).send('Brand ID not provided');
        }
        const result = await Brand.deleteOne({ _id: id });
        if(result.deletedCount === 0 ){
            return res.status(404).send('Brand not found');
        }
        res.status(200).send('Brand deleted successfully');
    } catch (error) {
        console.error('Error deleting brand:', error);
        res.status(500).send('Internal Server Error');
    }
};

const searchBrand = async (req, res) => {
  try {
    const searchString = req.body.query;
    let page =1;
    if(req.query.page){
      page = req.query.page;
    }
    const limit = 3;

    const brands = await Brand.find({
      brandName:{$regex:searchString,$options:"i"}
    })
    .limit(limit*1)
    .skip((page-1)*limit)
    .exec();

    const count = await Brand.find({
      brandName:{$regex:searchString,$options:"i"}
    }).countDocuments();
    
    res.render("brands", {
        data:brands,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      });
    console.log(brands);
  } catch (error) {
    console.log('Error while searching user : ', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
    getBrandPage,
    addBrand,
    blockBrand,
    unblockBrand,
    deleteBrand,
    searchBrand
}