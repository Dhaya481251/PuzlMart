const mongoose = require('mongoose');
const {Schema} = mongoose;

const userSchema = new Schema({
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true,
        unique:true
    },
    phone : {
        type:String,
        required:false,
        unique:true,
        sparse:true,
        default:null
    },
    googleId:{
        type:String,
        unique:false
    },
    password:{
        type:String,
        required:false
    },
    isBlocked:{
        type:Boolean,
        default:false
    },
    isAdmin:{
        type:Boolean,
        default:false
    },
    cart:[{
        type:Schema.Types.ObjectId,
        ref:"Cart"
    }],
    wallet:{
        balance:{
            type:Number,
            default:0
        },
        /*transactions:[
            {
                transactionsType:{
                    type:String,
                    enum:['credit','debit'],
                    required:true
                },
                amount:{
                    type:Number,
                    required:true
                },
                reason:{
                    type:String,
                    required:true
                },
                data:{
                    type:Date,
                    default:Date.now
                }
            }
        ],
        default:[]*/
    },
    wishlist:[{
        type:Schema.Types.ObjectId,
        ref:"Wishlist"
    }],
    orderHistory:[{
        type:Schema.Types.ObjectId,
        ref:"Order"
    }],
    createdOn : {
        type:Date,
        default:Date.now
    },
    referralCode:{
        type:String
    },
    redeemed :{
        type:Boolean,
    },
    redeemedUsers:[{
        type:Schema.Types.ObjectId,
        ref:"User"
    }],
    searchHistory:[{
        category:{
            type:Schema.Types.ObjectId,
            ref:'Category'
        },
        brand:{
            type:String
        },
        searchOn:{
            type:Date,
            default:Date.now
        }
    }]
})

const User = mongoose.model("User",userSchema);

module.exports = User;