const Coupon = require('../../models/couponSchema');

const getCoupons = async (req,res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const coupons = await Coupon.find({})
        .sort({createdOn:-1})
        .skip(skip)
        .limit(limit);

        const totalCoupons = await Coupon.countDocuments();
        const totalPages = Math.ceil(totalCoupons/limit);

        res.render('coupons',{
            coupons,
            currentPage:page,
            totalPages:totalPages,
            totalCoupons:totalCoupons
        });
    } catch (error) {
        console.error('coupons page error : ',error);
        res.status(500).send('Internal Server Error');
    }
}

const loadAddCouponPage = async (req,res) => {
    try {
        res.render('addCoupon')
    } catch (error) {
        
    }
}

const addCoupon = async (req,res) => {
    try {
        const {name,expireOn,offerPrice,minimumPrice} = req.body;

        const existingCoupon = await Coupon.findOne({name});
        if(existingCoupon){
            res.status(400).json({message:'Coupon already exists',type:'error'});
        }
        const newCoupon = new Coupon({
            name,
            expireOn,
            offerPrice,
            minimumPrice
        });
        await newCoupon.save();
        return res.status(200).json({message:'Coupon added successfully',type:'success'})
    } catch (error) {
        console.error('Coupon adding error : ',error);
        res.status(500).json({message:"Internal server error",type:'error'});
    }
}

const removeCoupon = async (req,res) => {
    try {
        const id = req.params.id;
        const removeCoupon = await Coupon.findByIdAndDelete(id);

        if(!removeCoupon){
            res.status(404).json({status:false,message:'Coupon not found'});
        }

        return res.status(200).json({message:'Category deleted successfully',removeCoupon});
    } catch (error) {
        console.error('Error removing coupon : ',error);
        res.status(500).json({status:false,message:'Internal Server Error'});
    }
}

const activeCoupon = async (req,res) => {
    try {
        let id = req.query.id;
        await Coupon.updateOne({_id:id},{$set:{isList:false}});
        res.redirect('/admin/coupons');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const inactiveCoupon = async (req,res) => {
    try {
        let id = req.query.id;
        await Coupon.updateOne({_id:id},{$set:{isList:true}});
        res.redirect('/admin/coupons');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

module.exports = {
    getCoupons,
    loadAddCouponPage,
    addCoupon,
    removeCoupon,
    activeCoupon,
    inactiveCoupon
}