const mongoose = require('mongoose');
const {Schema} = mongoose;

const productSchema = new Schema({
    productName:{
        type:String,
        required:true
    },
    description:{
        type:String,
        required:true,
        default:'No description available'
    },
    brand:{
        type:String,
        required:true
    },
    category:{
        type:Schema.Types.ObjectId,
        ref:'Category',
        required:true
    },
    regularPrice:{
        type:Number,
        required:true
    },
    salePrice:{
        type:Number,
        // required:true
    },
    productOffer:{
        type:Schema.Types.ObjectId,
        ref:'Offer',
        default:null
    },
    quantity:{
        type:Number,
        required:true,
        default:0
    },
    productImage:{
        type:[String],
        required:true
    },
    discount:{
        type:Number,
        default:null
    },
    reviews:[
        {
            userId:{
                type:Schema.Types.ObjectId,
                ref:'User'
            },
            review:{
                type:String
            },
            rating:{
                type:Number,
                required:true,
                min:1,
                max:5
            },
            createdAt:{
                type:Date,
                default:Date.now
            }
        }
    ],
    averageRating:{
        type:Number,
        default:0
    },
    totalReviews:{
        type:Number,
        default:0
    },
    createdOn:{
        type:Date,
        default:Date.now
    },
    specs:{
        type:[String]
    },
    relatedProducts:[
        {
            type:Schema.Types.ObjectId,
            ref:'Product'
        }
    ],
    isBlocked:{
        type:Boolean,
        default:false
    },
    status:{
        type:String,
        enum:['Available','Out of stock','Discontinued'],
        default:'Available'
    },
    featured:{
        type:Boolean,
        default:false
    },
    popularity:{
        type:Number,
        default:0
    },
    views:{
        type:Number,
        default:0
    },
    purchases:{
        type:Number,
        default:0
    }
},{timestamps:true});


const Product = mongoose.model("Product",productSchema);

module.exports = Product;