if (process.env.NODE_ENV != "production") {
  require('dotenv').config();
}


const express = require("express");
const app = express();
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const path = require("path");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const port = process.env.PORT || 8080;


const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");


// const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
const dbUrl = process.env.ATLASDB_URL;
const sessionSecret = process.env.SECRET || "development-secret";
const sessionCollectionName = process.env.SESSION_COLLECTION || "sessions_v2";
const isServerlessRuntime =
  process.env.VERCEL === "1" ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const useMongoSessionStore =
  process.env.USE_MONGO_SESSION === "true" && !isServerlessRuntime;

main()
  .then(() => {
    console.log("Connected to database");
  })
  .catch((err) => {
    console.log(err);
  });
async function main() {
  await mongoose.connect(dbUrl);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine('ejs', ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

app.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  const originalRender = res.render.bind(res);
  const originalRedirect = res.redirect.bind(res);

  res.send = (...args) => {
    if (res.headersSent) {
      return res;
    }
    return originalSend(...args);
  };

  res.render = (...args) => {
    if (res.headersSent) {
      return res;
    }
    return originalRender(...args);
  };

  res.redirect = (...args) => {
    if (res.headersSent) {
      return res;
    }
    return originalRedirect(...args);
  };

  next();
});


let store;
if (useMongoSessionStore) {
  try {
    const storeOptions = {
      mongoUrl: dbUrl,
      collectionName: sessionCollectionName,
      touchAfter: 24 * 3600,
    };

    store = MongoStore.create(storeOptions);

    store.on("error", (err) => {
      console.log("Error in MONGO SESSION STORE", err);
    });
  } catch (err) {
    console.log("Falling back to MemoryStore", err);
  }
}

const sessionOptions = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie:{
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

if (store) {
  sessionOptions.store = store;
}




app.use(session(sessionOptions));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


app.use( (req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  res.locals.searchQuery = req.query?.q || "";
  res.locals.selectedCategory = req.query?.category || "";
  next();
});

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);


app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page not found!"));
});

app.use( (err, req, res, next) => {
  if (res.headersSent) {
    console.error(err);
    return;
  }
  let {statusCode = 500, message = "Something went wrong!" } = err;
  return res.status(statusCode).send(message);
  // res.status(statusCode).send(message);
});

if (process.env.VERCEL !== "1") {
  app.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });
}

module.exports = app;
