const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const env = require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID:process.env.GOOGLE_CLIENT_ID,
    clientSecret:process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:'/auth/google/callback'
},async(accessToken,refreshToken,profile,done) => {
    try {
        const user = await User.findOne({googleId:profile.id});
        
        if(user){
            console.log('User found in database : ',user);
            return done(null,user);
        }

        const newUser = new User({
            googleId:profile.id,
            name:profile.displayName,
            email:profile.emails[0].value
        });

        await newUser.save();
        console.log('New user created : ',newUser);
        return done(null,newUser);

    } catch (error) {
        console.error('Error in Google strategy : ', error);
        return done(error);
    }
}
));

passport.serializeUser((user,done) => {

    done(null,user.id);

});

passport.deserializeUser(async(id,done) => {
   const user = await User.findById(id);
   done(null,user)
})

module.exports = passport;
