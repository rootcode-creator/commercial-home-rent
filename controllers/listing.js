const Listing = require("../models/listing.js");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const categoryKeywords = {
  rooms: ["room", "bedroom", "suite", "apartment", "studio"],
  "iconic-cities": ["city", "downtown", "urban", "metropolitan"],
  mountains: ["mountain", "hill", "valley", "peak"],
  castle: ["castle", "fort", "palace", "heritage"],
  "amazing-pools": ["pool", "swimming", "infinity pool"],
  camping: ["camp", "camping", "tent", "forest"],
  dome: ["dome", "igloo", "geodesic"],
  boats: ["boat", "yacht", "ship", "houseboat"],
};

const categoryLabels = {
  rooms: "Rooms",
  "iconic-cities": "Iconic Cities",
  mountains: "Mountains",
  castle: "Castle",
  "amazing-pools": "Amazing Pools",
  camping: "Camping",
  dome: "Dome",
  boats: "Boats",
};

module.exports.index = async (req, res) => {
  const searchQuery = req.query.q?.trim() || "";
  const selectedCategory = req.query.category?.trim().toLowerCase() || "";
  const conditions = [];

  if (searchQuery) {
    const safeQuery = escapeRegex(searchQuery);
    conditions.push({
      $or: [
        { title: { $regex: safeQuery, $options: "i" } },
        { location: { $regex: safeQuery, $options: "i" } },
        { country: { $regex: safeQuery, $options: "i" } },
        { description: { $regex: safeQuery, $options: "i" } },
      ],
    });
  }

  if (selectedCategory && categoryKeywords[selectedCategory]) {
    const categoryPattern = categoryKeywords[selectedCategory]
      .map((keyword) => escapeRegex(keyword))
      .join("|");

    conditions.push({
      $or: [
        { category: selectedCategory },
        {
          $and: [
            { $or: [{ category: { $exists: false } }, { category: null }, { category: "" }] },
            {
              $or: [
                { title: { $regex: categoryPattern, $options: "i" } },
                { location: { $regex: categoryPattern, $options: "i" } },
                { country: { $regex: categoryPattern, $options: "i" } },
                { description: { $regex: categoryPattern, $options: "i" } },
              ],
            },
          ],
        },
      ],
    });
  }

  const filter = conditions.length > 0 ? { $and: conditions } : {};
  let allListings = await Listing.find(filter);

  return res.render("listings/index.ejs", {
    allListings,
    searchQuery,
    selectedCategory,
    selectedCategoryLabel: categoryLabels[selectedCategory] || "",
    selectedCategoryCount: selectedCategory ? allListings.length : null,
  });
};

module.exports.renderNewForm = (req, res) => {
  return res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id)
    .populate({ path: "reviews", populate: { path: "author" } })
    .populate("owner");
  if (!listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }
  return res.render("listings/show.ejs", { listing });
};


module.exports.createListing = async (req, res, next) => {
  
  let response = await geocodingClient.forwardGeocode({
    query: req.body.listing.location,
    limit: 1,
  })
    .send();
  
  let url = req.file.path;
  let filename = req.file.filename;
  let newListing = new Listing(req.body.listing);
  newListing.owner = req.user._id;
  newListing.image = { url, filename };
  newListing.geometry = response.body.features[0].geometry;

  let savedListing = await newListing.save();
  console.log(savedListing);

  req.flash("success", "New Listing Created!");
  return res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }

  let orginalImageUrl = listing.image.url;
  orginalImageUrl.replace("/upload", "/upload/h_200,w_300");
  return res.render("listings/edit.ejs", { listing, orginalImageUrl });
};


module.exports.updateListing = async (req, res) => {
  let { id } = req.params;
  let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

  if (typeof req.file != "undefined") {
    let url = req.file.path;
    let filename = req.file.filename;
    listing.image = { url, filename };
    await listing.save();
  }

  req.flash("success", "Listing Updated!");
  return res.redirect(`/listings/${id}`);
};


module.exports.destroyListing = async (req, res) => {
  let { id } = req.params;
  await Listing.findByIdAndDelete(id);
  req.flash("success", "Listing Deleted!");
  return res.redirect("/listings");
};