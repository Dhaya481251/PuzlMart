const express = require("express");
const app = express();
const path = require("path");
const env = require("dotenv").config();
const session = require("express-session");

const passport = require("./config/passport");
const db = require("./config/db");
const payment = require("./config/paymentRoute");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
db();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
    },
  })
);


app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.set("cache-control", "no-store");
  next();
});

app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin"),
  path.join(__dirname, "views/partials"),
  path.join(__dirname, "views")
]);
app.use(express.static("public"));

app.use("/", userRouter);
app.use("/admin", adminRouter);

app.get('/404', (req, res) => {
  res.status(404).render('404Page');
});

app.get('/admin/404', (req, res) => {
  res.status(404).render('admin404Page');
});

app.use((req, res) => {
  if (req.originalUrl.startsWith('/admin')) {
      res.redirect('/admin/404');
  } else {
      res.redirect('/404');
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server Started Running...");
});
