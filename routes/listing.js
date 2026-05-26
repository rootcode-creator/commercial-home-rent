const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const Listing = require("../models/listing.js");
const { isLoggedIn, isOwner, validateListing } = require("../middleware.js");
const listingController = require("../controllers/listing.js");
const multer  = require('multer');
const {storage} = require("../cloudConfig.js");
const upload = multer({storage});




router.route("/")
  .get(wrapAsync(listingController.index))
  .post(isLoggedIn,  
    upload.single("listing[image]"),
    validateListing,
    wrapAsync(listingController.createListing));
  

//New Route
router.get("/new", isLoggedIn, listingController.renderNewForm);

router.get("/mylistings", isLoggedIn, wrapAsync(listingController.myListings));

router.get("/mylistings/:id/orders", isLoggedIn, wrapAsync(listingController.renderListingOrders));

router.post("/mylistings/:id/maintenance", isLoggedIn, isOwner, wrapAsync(listingController.markMaintenance));
router.post("/mylistings/:id/active", isLoggedIn, isOwner, wrapAsync(listingController.setListingActive));

router.post("/:id/maintenance", isLoggedIn, isOwner, wrapAsync(listingController.markMaintenance));
router.post("/:id/active", isLoggedIn, isOwner, wrapAsync(listingController.setListingActive));

router.get("/reservations", isLoggedIn, wrapAsync(listingController.renderReservationsPage));

router.get("/reservations/:sessionId/receipt", isLoggedIn, wrapAsync(listingController.renderReceipt));
router.get("/reservations/:sessionId/pdf", isLoggedIn, wrapAsync(listingController.generateReceiptPdf));
router.post("/reservations/:sessionId/cancel", isLoggedIn, wrapAsync(listingController.cancelReservation));


router.route("/:id")
  .get(wrapAsync(listingController.showListing))
  .put(isLoggedIn, isOwner, 
    upload.single("listing[image]"),
    validateListing, wrapAsync(listingController.updateListing))
  .delete(isLoggedIn, isOwner, wrapAsync(listingController.destroyListing));

router.get("/:id/payment", isLoggedIn, wrapAsync(listingController.renderPaymentPage));


//Edit Route
router.get(
  "/:id/edit",
  isLoggedIn,
  isOwner,
  wrapAsync(listingController.renderEditForm)
);

module.exports = router;
