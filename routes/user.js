const express = require("express");
const router = express.Router();
const User = require("../models/user.js");
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { saveRedirectUrl, isLoggedIn } = require("../middleware.js");
const userControllers = require("../controllers/users.js");
const multer  = require('multer');
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });

//testing
router.get("/", userControllers.root);

router.get("/terms", (req, res) => {
  res.render("pages/terms");
});

router.get("/privacy", (req, res) => {
  res.render("pages/privacy");
});

router.route("/signup")
  .get(userControllers.renderSignUpForm)
  .post(wrapAsync(userControllers.signup));

router.route("/login")
  .get(userControllers.renderLoginForm)
  .post(saveRedirectUrl, passport.authenticate("local", { failureRedirect: "/login", failureFlash: true, }), userControllers.login);

router.get("/logout", userControllers.logout);

router.route("/users/profile/edit")
  .get(isLoggedIn, userControllers.renderEditProfileForm)
  .post(isLoggedIn, upload.single("profile[image]"), wrapAsync(userControllers.updateProfile));


router.route("/profile/edit")
  .get(isLoggedIn, userControllers.renderEditProfileForm)
  .post(isLoggedIn, upload.single("profile[image]"), wrapAsync(userControllers.updateProfile));

// Dummy messaging page (functionality coming soon)
router.get('/users/:id/message', wrapAsync(async (req, res) => {
  const host = await User.findById(req.params.id).lean();
  if (!host) {
    req.flash('error', 'User not found');
    return res.redirect('back');
  }
  return res.render('users/message.ejs', { host });
}));

module.exports = router;
