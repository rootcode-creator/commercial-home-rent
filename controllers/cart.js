const Listing = require("../models/listing.js");
const PaymentRecord = require("../models/paymentRecord.js");

const getListingStatusMessage = (status) => {
  if (status === "maintenance") {
    return "This listing is under maintenance. New reservations are temporarily unavailable.";
  }

  if (status === "inactive") {
    return "Listing is inactive.";
  }

  return "Listing is unavailable.";
};

module.exports.renderCartPage = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id).populate("owner");

  // debug: removed console.log used during development

  if (!listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }

  if (listing.status !== "active") {
    req.flash("error", getListingStatusMessage(listing.status));
    return res.redirect("/listings");
  }

  if (listing.owner && listing.owner._id && listing.owner._id.equals(req.user._id)) {
    req.flash("error", "You cannot pay for your own listing");
    return res.redirect(`/listings/${id}`);
  }

  const bookingRecords = await PaymentRecord.find({
    status: "paid",
    paymentStatus: "paid",
    lastEventType: { $in: ["checkout.session.completed", "checkout.session.async_payment_succeeded"] },
    listingId: String(listing._id),
  })
    .select("bookingStartDate bookingEndDate reservationDate bookingDays")
    .lean();

  const msPerDay = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookingRanges = bookingRecords
    .map((record) => {
      const startRaw = record.bookingStartDate || record.reservationDate || null;
      if (!startRaw) return null;

      const start = new Date(startRaw);
      if (Number.isNaN(start.getTime())) return null;

      const hasExplicitEnd = Boolean(record.bookingEndDate);
      let end = hasExplicitEnd ? new Date(record.bookingEndDate) : null;
      let endInclusive = null;
      if (!end || Number.isNaN(end.getTime())) {
        const days = Math.max(1, Number(record.bookingDays) || 1);
        // bookingDays is inclusive: endInclusive = start + (days - 1)
        const offsetDays = Math.max(0, days - 1);
        endInclusive = new Date(start.getTime() + offsetDays * msPerDay);
      } else {
        // bookingEndDate is stored as inclusive (last booked day)
        endInclusive = new Date(end.getTime());
      }

      if (endInclusive <= today) return null;

      if (endInclusive < start) {
        endInclusive.setTime(start.getTime());
      }

      return {
        start: start.toISOString().slice(0, 10),
        end: endInclusive.toISOString().slice(0, 10),
      };
    })
    .filter(Boolean);

  return res.render("cart/cart.ejs", { listing, bookingRanges });
};

module.exports.createCheckoutSession = async (req, res) => {
  const { listingId, days = 1, gstEnabled = false } = req.body;
  const safeDays = Math.max(1, Number(days) || 1);

  const listing = await Listing.findById(listingId);
  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  if (listing.status !== "active") {
    return res.status(400).json({ error: getListingStatusMessage(listing.status) });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe secret key is missing" });
  }

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const subtotal = listing.price * safeDays;
  const gst = gstEnabled ? subtotal * 0.18 : 0;
  const total = subtotal + gst;

  const origin = `${req.protocol}://${req.get("host")}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: req.user?.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "bdt",
          unit_amount: Math.round(total * 100),
          product_data: {
            name: listing.title,
            description: `${safeDays} night(s) at ${listing.location}, ${listing.country}`,
            images: listing.image?.url ? [listing.image.url] : [],
          },
        },
      },
    ],
    success_url: `${origin}/cart/${listing._id}?payment=success`,
    cancel_url: `${origin}/cart/${listing._id}?payment=cancelled`,
    metadata: {
      listingId: String(listing._id),
      listingTitle: listing.title,
      listingLocation: listing.location,
      listingCountry: listing.country,
      userId: String(req.user?._id || ""),
      customerEmail: String(req.user?.email || ""),
      days: String(safeDays),
      gstEnabled: String(Boolean(gstEnabled)),
    },
  });

  return res.json({ id: session.id });
};

module.exports.renderBookedListings = async (req, res) => {
  const filters = {
    status: "paid",
    paymentStatus: "paid",
    lastEventType: { $in: ["checkout.session.completed", "checkout.session.async_payment_succeeded"] },
    $or: [
      { userId: String(req.user._id) },
      { customerEmail: req.user.email },
    ],
  };

  const bookedRecords = await PaymentRecord.find(filters)
    .sort({ createdAt: -1 })
    .lean();

  const listingIds = [...new Set(bookedRecords.map((record) => record.listingId).filter(Boolean))];
  const listings = await Listing.find({ _id: { $in: listingIds } }).lean();
  const listingsById = new Map(listings.map((listing) => [String(listing._id), listing]));

  const bookedListings = bookedRecords.map((record) => ({
    ...record,
    listing: listingsById.get(String(record.listingId)) || null,
  }));

  return res.render("cart/booked-listings.ejs", { bookedListings });
};