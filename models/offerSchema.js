const mongoose = require('mongoose');
const {Schema} = mongoose;

const offerSchema = new Schema({
    
    offerType:{
        type:String,
        enum:['Product','Category','Refferal'],
        required:true
    },
    discountType:{
        type:String,
        enum:['Percentage','Number'],
        required:true
    },
    value:{
        type:Number,
        default:0
    },
    startDate:{
        type:Date,
        required:true
    },
    endDate:{
        type:Date,
        required:true
    },
    isActive:{
        type:Boolean,
        default:true
    }
});

const Offer = mongoose.model('Offer',offerSchema);

module.exports = Offer;