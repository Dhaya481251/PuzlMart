const Referral = require('../../models/referralSchema');
const Offer = require('../../models/offerSchema');

const loadReferral = async(req,res) => {
    try {
            const page = parseInt(req.query.page) || 1;
            const limit = 4;
            const skip = (page-1)*limit;
    
            const referrals = await Referral.find({})
            .sort({createdOn:-1})
            .skip(skip)
            .limit(limit);
    
            const totalReferrals = await Referral.countDocuments();
            const totalPages = Math.ceil(totalReferrals/limit);
    
            res.render('referrals',{
                referrals,
                currentPage:page,
                totalPages:totalPages,
                totalReferrals:totalReferrals
            });
    } catch (error) {
        console.error('load referral page error : ',error);
        res.status(500).send('Internal server error');
    }
}

const addReferral = async(req,res) => {
    try {
        const { code, rewardType, rewardValue } = req.body;

        const existingReferral = await Referral.findOne({ code });
        if (existingReferral) {
            return res.status(400).json({ message: 'Referral code already exists' });
        }
        
        const newReferral = new Referral({
            code,
            rewardType,
            rewardValue,
            isActive: true
        });

        await newReferral.save();

        

        res.status(201).json({ message: 'Referral code created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating referral code', error })
    }
}

const loadAddReferral = async(req,res) => {
    try {
        res.render('addReferralOffer');
    } catch (error) {
        res.status(500).send('Internal server error');
    }
}

const removeReferral = async (req,res) => {
    try {
        const id = req.params.id;
        const removeCoupon = await Referral.findByIdAndDelete(id);

        if(!removeCoupon){
            res.status(404).json({status:false,message:'Referral Offer not found'});
        }

        return res.status(200).json({message:'Referral Offer deleted successfully',removeReferral});
    } catch (error) {
        console.error('Error removing referral offer : ',error);
        res.status(500).json({status:false,message:'Internal Server Error'});
    }
}

module.exports = {
    loadReferral,
    loadAddReferral,
    addReferral,
    removeReferral
}