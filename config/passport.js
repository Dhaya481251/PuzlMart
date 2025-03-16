const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
const env = require("dotenv").config();
const crypto = require("crypto");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await User.findOne({ googleId: profile.id });

        if (user) {
          return done(null, user);
        }

        const userReferralCode = crypto
          .randomBytes(3)
          .toString("hex")
          .toUpperCase();

        const referralCode = user ? user.referralCode : null;

        const newUser = new User({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          referralCode: userReferralCode,
          referredBy: referralCode || null,
        });

        if (referralCode) {
          const referrer = await User.findOne({ referralCode });
          if (referrer) {
            referrer.wallet.balance += 100;
            newUser.wallet.balance += 100; 

            const referrerTransaction = {
              transactionsType: "credit",
              amount: 100,
              reason: "Referred a friend",
              date: new Date(),
            };

            const referredTransaction = {
              transactionsType: "credit",
              amount: 100,
              reason: "Referred by a friend",
              date: new Date(),
            };

            referrer.wallet.transactions.push(referrerTransaction);
            newUser.wallet.transactions.push(referredTransaction);

            await referrer.save();
          }
        }

        await newUser.save();
        
        return done(null, newUser);
      } catch (error) {
        
        return done(error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

module.exports = passport;
