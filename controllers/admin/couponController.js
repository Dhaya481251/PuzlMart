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
        res.render('addCoupon');
    } catch (error) {
        console.error('Error while loading add coupon page : ',error);
        res.status(500).send('Internal Server Error')
    }
}

const addCoupon = async (req,res) => {
    try {
        const {name,code,expireOn,minimumPrice,discountType,discount,usageLimit} = req.body;

        const existingCoupon = await Coupon.findOne({$or:[{name:name},{code:code}]});
        if(existingCoupon){
            res.status(400).json({message:'Coupon already exists',type:'error'});
        }else{
            if(discountType === 'Percentage'){
                if(discount < 1 || discount > 90){
                    return res.status(400).json({message:'Discount value must be between 1 and 90'});
                }else{
                    const newCoupon = new Coupon({
                        name,
                        code,
                        expireOn,
                        minimumPrice,
                        discountType,
                        discount,
                        usageLimit,
                        usedCount:0
                    });
                    await newCoupon.save();
                    return res.status(200).json({message:'Coupon added successfully',type:'success'});
                }
            }else if(discountType === 'Flat'){
                const newCoupon = new Coupon({
                    name,
                    code,
                    expireOn,
                    minimumPrice,
                    discountType,
                    discount,
                    usageLimit,
                    usedCount:0
                });
                await newCoupon.save();
                return res.status(200).json({message:'Coupon added successfully',type:'success'});
            }
        
    }
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
        await Coupon.updateOne({_id:id},{$set:{isActive:true}});
        res.redirect('/admin/coupons');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const inactiveCoupon = async (req,res) => {
    try {
        let id = req.query.id;
        await Coupon.updateOne({_id:id},{$set:{isActive:false}});
        res.redirect('/admin/coupons');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const searchCoupon = async (req, res) => {
  try {
    const searchString = req.body.query;
    let page =1;
    if(req.query.page){
      page = req.query.page;
    }
    const limit = 3;

    const coupons = await Coupon.find({
      name:{$regex:searchString,$options:"i"}
    })
    .limit(limit*1)
    .skip((page-1)*limit)
    .exec();

    const count = await Coupon.find({
      name:{$regex:searchString,$options:"i"}
    }).countDocuments();
    
    res.render("coupons", {
        coupons:coupons,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      });
    console.log(coupons);
  } catch (error) {
    console.log('Error while searching user : ', error);
    res.status(500).send('Internal Server Error');
  }
};



module.exports = {
    getCoupons,
    loadAddCouponPage,
    addCoupon,
    removeCoupon,
    activeCoupon,
    inactiveCoupon,
    searchCoupon
}