const User = require('../models/userSchema');

const userAuth = (req,res,next) => {
    if(req.session.user){
        User.findById (req.session.user)
        .then(data => {
            if(data){
                if(data.isBlocked){
                    req.session.destroy((err) => {
                        if(err){
                            console.log('Session destroy error : ',err.message);
                        }
                        return res.redirect('/login')
                    });
                }else{
                    res.locals.user = data;
                    next();
                }
            }else{
                return res.redirect('/login')
            }
        })
        .catch(error => {
            console.log('Error in user auth middleware : ', error.message);
            res.status(500).send('Internal Server Error');
        })
    }else{
        res.redirect('/login');
    }
}

const adminAuth = (req,res,next) => {
   if(req.session.admin){
    next();
   }else{
    res.redirect('/admin/login')
   }
}

module.exports = {
    userAuth,
    adminAuth
}