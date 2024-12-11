const express = require("express");
const app = express();
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const path = require("path");
const ejsMate = require("ejs-mate");
const Listing = require("./models/Listing.js");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
const {listingSchema, reviewSchema} = require("./schema.js");
const Review = require("./models/review.js");


const port = 8080;

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

main()
  .then(() => {
    console.log("Connected to database");
  })
  .catch((err) => {
    console.log(err);
  });
async function main() {
  await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine('ejs', ejsMate);
app.use(express.static(path.join(__dirname, "/public")));


app.get("/", (req, res) => {
  res.send("Hi, I am root");
});

const validateListing = (req, res, next) => {
  let {error} = listingSchema.validate(req.body);
  if (error) {
    let errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  }else{
    next();
  }
};


const validateReview = (req, res, next) => {
  let {error} = reviewSchema.validate(req.body);
  if (error) {
    let errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  }else{
    next();
  }
}

// Index Route
app.get("/listings", wrapAsync( async (req, res) => {
  let allListings = await Listing.find({});
  res.render("listings/index.ejs", { allListings });
}));

//New Route
app.get("/listings/new", (req, res) => {
  res.render("listings/new.ejs");
});

//Show Route
app.get("/listings/:id", wrapAsync( async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id).populate("reviews");
  res.render("listings/show.ejs", { listing });
}));

//Create Route
app.post("/listings", validateListing, wrapAsync(async (req, res) => {
  // let {title, description, image, price, country, location } = req.body;
  let newListing = new Listing(req.body.listing);
  await newListing.save();
  console.log(newListing);
  res.redirect("/listings");
}));

//Edit Route
app.get("/listings/:id/edit", wrapAsync( async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);

  res.render("listings/edit.ejs", { listing });
}));

//Update Route
app.put("/listings/:id", validateListing, wrapAsync( async (req, res) => {
  let { id } = req.params;
  await Listing.findByIdAndUpdate(id, { ...req.body.listing });
  res.redirect(`/listings/${id}`);
}));

//Destroy Route
app.delete("/listings/:id", wrapAsync( async (req, res) => {
  let { id } = req.params;
  let deleteListing = await Listing.findByIdAndDelete(id);
  console.log(deleteListing);
  res.redirect("/listings");
}));


//Reviews
//Post Review Route
app.post("/listings/:id/reviews", validateReview, wrapAsync(async(req, res) => {
  let listing = await Listing.findById(req.params.id);
  let newReview = new Review(req.body.review);
  listing.reviews.push(newReview);
  await newReview.save();
  await listing.save();
  console.log("New review saved");
  res.redirect(`/listings/${listing._id}`);
}));

//Delete Review Route
app.delete("/listings/:id/reviews/:reviewId", wrapAsync( async(req, res) => {
  let {id, reviewId } = req.params;
  await Listing.findByIdAndUpdate(id, {$pull: {reviews: reviewId} });
  await Review.findByIdAndDelete(reviewId);
  res.redirect(`/listings/${id}`);
}));

// app.get("/testListing", async (req, res) => {
//   let sampleListing = new Listing({
//     title: "New Villa",
//     description: "By then beach",
//     price: 1200,
//     location: "Goa",
//     country: "India",
//   });

//   await sampleListing.save();
//   console.log("sample saved");
//   res.send("sucsessful testing");
// });


app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page not found!"));
})

app.use( (err, req, res, next) => {
  let {statusCode = 500, message = "Something went wrong!" } = err;
  res.status(statusCode).render("error.ejs",{message});
  // res.status(statusCode).send(message);
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
