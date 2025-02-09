const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema');


const loadOffer = async(req,res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const offers = await Offer.find({})
        .sort({createdOn:-1})
        .skip(skip)
        .limit(limit);

        const totalOffers = await Offer.countDocuments();
        const totalPages = Math.ceil(totalOffers/limit);

        res.render('offer',{
            offers,
            currentPage:page,
            totalPages:totalPages,
            totalOffers:totalOffers
        });
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }

}

const activateOffer = async(req,res) => {
    try {
        let id = req.query.id;
        await Offer.updateOne({_id:id},{$set:{isActive:false}});
        res.redirect('/admin/offer')
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const deactivateOffer = async(req,res) => {
    try {
        let id = req.query.id;
        await Offer.updateOne({_id:id},{$set:{isActive:true}});
        res.redirect('/admin/offer');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const searchOffer = async (req, res) => {
  try {
    const searchString = req.body.query;
    let page =1;
    if(req.query.page){
      page = req.query.page;
    }
    const limit = 3;

    const offers = await Offer.find({
      $or:[
        {offerType:{$regex:searchString,$options:"i"}},
        {discountType:{$regex:searchString,$options:"i"}}
      ]
    })
    .lean()
    .limit(limit*1)
    .skip((page-1)*limit)
    .exec();

    const count = await Offer.find({
      $or:[
        {offerType:{$regex:searchString,$options:"i"}},
        {discountType:{$regex:searchString,$options:"i"}}
      ]
    }).countDocuments();
    
    res.render("offer", {
        offers:offers,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      });
    console.log(offers);
  } catch (error) {
    console.log('Error while searching user : ', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
    loadOffer,
    activateOffer,
    deactivateOffer,
    searchOffer
}