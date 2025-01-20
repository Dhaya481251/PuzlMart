const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const loadHomepage = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const categories = await Category.find({isListed:true});
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId); // Remove items with null productId
          }
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categories.map(category => category._id)},
            quantity:{$gt:0}
        })
        .sort({createdOn:-1})
        .limit(4);
        if(userId){
        res.render('home',{user:userData,products:productData,cart,wishlist});
        }
        console.log('Home Page loaded');
    } catch (error) {
        console.error('Home Page not found',error);
        res.status(500).send('Server Error');
    }
}

const loadLogin = async(req,res) => {
    try {
        if(!req.session.user){
            console.log('Login Page');
            return res.render('login');
        }else{
            console.log('Home Page');
            return res.redirect('/');
        }
    } catch (error) {
        console.log('Login page not loading',error)
        res.status(500).send('Server Internal Error')
    }
}

const loadSignup = async(req,res) => {
    try {
        console.log('Signup Page');
        return res.render('signup');
    } catch (error) {
        console.log('Signup page not loading : ',error);
        res.status(500).send('Server Error');
    }
}

function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

async function sendVerificationEmail(email,otp){
    try {
        
        const transporter = nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:'Verify your account',
            text:`Your OTP is ${otp}`,
            html:`<b>Your OTP : ${otp}</b>`
        })

        return info.accepted.length > 0

    } catch (error) {
        
        console.error('Error sending Email',error);
        return false;

    }
}

const signup = async(req,res) => {
    
    try {
        
        const {name,phone,email,password,cPassword}  = req.body;
        if(password!==cPassword){
            return res.render('signup',{message:'Password do not match'});
        }

        const findUser = await User.findOne({email});

        if(findUser){
            return res.render('signup',{message:'User with this email already exist'});
        }
        
        const otp = generateOtp();

        const emailSent = await sendVerificationEmail(email,otp);

        if(!emailSent){
            return res.json('email-error')
        }
        
        req.session.userOtp = otp;
        req.session.userData = {name,phone,email,password,googleId:null};
        
        console.log('Redirecting to OTP page');
        res.render('verify-otp');
        console.log('OTP Sent',otp);
       

    } catch (error) {
        
        console.error('signup error',error);
        res.status(500).send('Server Internal Error');

    }
}

const securePassword = async(password) => {
    try {
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    } catch (error) {
        console.error('Error hashing password',error);
        throw new Error('Password hashing failed')
    }
}

const verifyOtp = async (req,res) => {
    try {
        const {otp} = req.body;
        console.log(otp);

        if(otp===req.session.userOtp){
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);
            const UserData = new User({
                name:user.name,
                email:user.email,
                phone:user.phone,
                password:passwordHash,
            })
            await UserData.save();

            console.log('Session user : ',req.session.user);
            res.json({success:true,redirectUrl:'/login'});
            
            
        }else{
            res.status(400).json({success:false,message:'Invalid OTP, Please try again'});
        }
    } catch (error) {
        console.error('Error verifying OTP',error);
        res.status(500).json({success:false,message:'An error occured'});
    }
}

const resendOtp = async(req,res) => {
    try {
        console.log('resend otp')
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:'Email not found in session'})
        }
        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log('Resend OTP : ',otp);
            res.status(200).json({success:true,message:'OTP Resend Successfully'})
        }else{
            res.status(500).json({success:false,message:'Failed to resend OTP. Please try again'});
        }
    } catch (error) {
        console.error('Error resending OTP',error);
        res.status(500).json({success:false,message:'Internal Server Error. Please try again'});
    }
}


const login = async(req, res) => {
    try {
        const { email, password } = req.body;

        
        const findUser = await User.findOne({ isAdmin: 0, email: email });

        if (!findUser) {
            console.log('Login Error: User not found');
            return res.render('login', { message: 'User not found' });
        }

        if (findUser.isBlocked) {
            console.log('Login Error: User is blocked');
            return res.render('login', { message: 'User is blocked by Admin' });
        }

        
        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            console.log('Login Error: Incorrect password');
            return res.render('login', { message: 'Incorrect Password' });
        }

        
        req.session.user = findUser._id;
        
        
        console.log('User logged in, session user ID:', req.session.user); 

        res.redirect('/');
    } catch (error) {
        console.error('Login Error:', error); 
        return res.render('login', { message: 'Login failed. Please try again later' });
    }
};


const logout = async(req,res) => {
    try {
        req.session.destroy((err) => {
            if(err){
                console.log('Session destruction error',err.message);
                return res.status(500).send('Internal Server Error')
            }
            console.log('User logged out successfully')
            return res.redirect('/login');
        })
    } catch (error) {
        console.log('Logout error',err);
        res.status(500).send('Internal Server Error');
    }
}

const loadForgotPassword = async(req,res) => {
    try {
        res.render('forgotPassword')
    } catch (error) {
        console.error('forgot Pasword error',error);
        res.status(500).send('Internal server error');
    }
}

const forgotEmailValid = async(req,res) => {
    try {
        const {email} = req.body;
        const findUser = await User.findOne({email:email});
        if(findUser){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.otp = otp;
                req.session.email = email;

                res.render('forgotPasswordOtp');
                
            }else{
                res.json({success:false,message:'Failed to send OTP. Please try again'});
            }
        }else{
            res.render('forgotPassword',{message:'User with this email does not exist'})
        }
    } catch (error) {
        console.error('error in forgot password',error);
        res.status(500).send("Internal Server Error");
    }
}

const verifyForgotOtp = async(req,res) => {
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.otp){
            res.json({success:true,redirectUrl:'/resetPassword'});
        }else{
            res.json({success:false,message:'Otp not matching'});
        }
    } catch (error) {
        res.status(500).json({success:false,message:'An error occured. Please try again'})
    }
}

const loadResetPassword = async(req,res) => {
    try {
        res.render('resetPassword');
    } catch (error) {
        res.status(500).send('Internal server error');
    }
}

const resendForgotOtp = async(req,res) => {
    try {
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
        console.log('Resending otp to email',email);

        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log('Forgot resend otp',otp);
            res.status(200).json({success:true,message:'Resend OTP successful'});
        }
    } catch (error) {
        console.log('forgot resend otp error',error);
        res.status(500).json({success:false,message:'Internal Server Error'});
    }
}

const resetPassword = async(req,res) => {
    try {
        const {newPass1,newPass2} = req.body;
        const email = req.session.email;
        if(newPass1 === newPass2){
            const passwordHash = await securePassword(newPass1);
            await User.updateOne({email:email},{$set:{password:passwordHash}})
            res.redirect('/login');
        }else{
            res.render('resetPassword',{message:'Passwords do not match'});
        }
    } catch (error) {
       console.log('reset password error',error);
       res.status(500).send('Internal Server Error');
    }
}

module.exports = {
    loadHomepage,
    loadLogin,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    login,
    logout,
    loadForgotPassword,
    forgotEmailValid,
    verifyForgotOtp,
    loadResetPassword,
    resendForgotOtp,
    resetPassword
}