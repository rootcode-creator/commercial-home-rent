const User = require("../models/user");
const { getFriendlyDbErrorMessage } = require("../utils/errorMessages");

//testing
module.exports.root = (req, res) => {
    return res.redirect("/listings");
};

module.exports.renderSignUpForm = (req, res) => {
    return res.render("users/signup.ejs");
};


module.exports.signup = async (req, res, next) => {
    try {
        let { username, email, password, city } = req.body;
        email = typeof email === 'string' ? email.trim().toLowerCase() : '';

        // basic email format validation
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!email || !emailRegex.test(email)) {
            req.flash('error', 'Please provide a valid email address.');
            return res.redirect('/signup');
        }

        // ensure email is not already registered
        const existing = await User.findOne({ email });
        if (existing) {
            req.flash('error', 'Email is already registered. Please login or use another email.');
            return res.redirect('/signup');
        }

        const newUser = new User({ email, username, city });
        const registeredUser = await User.register(newUser, password);
        req.login(registeredUser, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", "Welcome to Wanderlust");
            return res.redirect("/listings");
        });
    } catch (e) {
        const friendlyMessage = getFriendlyDbErrorMessage(e);
        if (friendlyMessage) {
            req.flash("error", friendlyMessage);
            return res.redirect("/signup");
        }

        // Handle duplicate key (race condition) with friendlier message
        if (e && e.code === 11000 && e.keyValue && e.keyValue.email) {
            req.flash('error', 'Email is already registered. Please login or use another email.');
            return res.redirect('/signup');
        }
        req.flash("error", e.message || 'An error occurred while signing up');
        return res.redirect("/signup");
    }
};


module.exports.renderLoginForm = (req, res) => {
    return res.render("users/login.ejs");
};


module.exports.login = async (req, res) => {
    req.flash("success", "Welcome back to Wanderlust!");
    let redirectUrl = res.locals.redirectUrl || "/listings";
    return res.redirect(redirectUrl);
};



module.exports.logout = (req, res, next) => {
    req.logOut((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "You are logged out!");
        return res.redirect("/listings");
    });
};

module.exports.renderEditProfileForm = (req, res) => {
    return res.render("users/edit.ejs", { user: req.user });
};

module.exports.updateProfile = async (req, res) => {
    const { displayName, bio } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/listings");
    }

    let hasUpdates = false;
    const trimmedName = typeof displayName === "string" ? displayName.trim() : "";
    if (trimmedName) {
        if (trimmedName.length < 2 || trimmedName.length > 50) {
            req.flash("error", "Name must be between 2 and 50 characters.");
            return res.redirect("/users/profile/edit");
        }
        user.displayName = trimmedName;
        hasUpdates = true;
    }
    const trimmedBio = typeof bio === 'string' ? bio.trim() : '';
    if (trimmedBio) {
        if (trimmedBio.length > 1000) {
            req.flash('error', 'Bio cannot exceed 1000 characters.');
            return res.redirect('/users/profile/edit');
        }
        user.bio = trimmedBio;
        hasUpdates = true;
    }
    if (req.file) {
        user.avatar = {
            url: req.file.path,
            filename: req.file.filename,
        };
        hasUpdates = true;
    }

    if (!hasUpdates) {
        req.flash('error', 'No changes submitted. Please update your profile.');
        return res.redirect('/users/profile/edit');
    }

    await user.save();
    req.user = user;
    req.flash("success", "Profile updated!");
    return res.redirect("/users/profile/edit");
};