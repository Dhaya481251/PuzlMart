const mongoose = require('mongoose');
const {Schema} = mongoose;

const referralSchema = new Schema({
    code:{
        type:String,
        required:true,
        unique:true
    },
    rewardType:{
        type:String,
        enum:['Percentage','Flat'],
        required:true
    },
    rewardValue:{
        type:Number,
        required:true
    },
    expiryDate:{
        type:Date,
        default:Date.now
    },
    isActive:{
        type:Boolean,
        default:true
    }
})

const Referral = mongoose.model("Referral",referralSchema);
module.exports = Referral;
