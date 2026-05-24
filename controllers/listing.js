const Listing = require("../models/listing.js");
const PaymentRecord = require("../models/paymentRecord.js");
const { sendBookingCancellationEmail } = require("./webhook.js");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
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

const loadPuppeteer = async () => {
  try {
    const coreModule = await import("puppeteer-core");
    return { puppeteer: coreModule.default || coreModule, usingCore: true };
  } catch (coreErr) {
    try {
      const fullModule = await import("puppeteer");
      return { puppeteer: fullModule.default || fullModule, usingCore: false };
    } catch (fullErr) {
      console.error("Puppeteer not installed:", coreErr.message, fullErr && fullErr.message);
      return { puppeteer: null, usingCore: false };
    }
  }
};

const buildReceiptPdfFallback = async ({ record, listing, sessionId }) => {
  const tmpPath = path.join(os.tmpdir(), `receipt-${sessionId}-${Date.now()}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const stream = fs.createWriteStream(tmpPath);

  const currency = String(record.originalCurrency || record.localCurrency || record.currency || 'USD').toUpperCase();
  const totalValue = record.originalAmountTotal ?? record.localAmountTotal ?? record.amountTotal ?? 0;
  const subtotal = Number(totalValue || 0);
  const tax = 0;
  const paymentMethod = Array.isArray(record.paymentMethodTypes) && record.paymentMethodTypes.length > 0
    ? record.paymentMethodTypes[0]
    : 'card';
  const bookingDays = record.bookingDays || 1;
  const reservedAt = record.reservationDate ? new Date(record.reservationDate).toLocaleString() : '';

  const waitForFinish = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  doc.pipe(stream);
  doc.rect(0, 0, doc.page.width, 14).fill('#22c55e');
  doc.moveDown(2);
  doc.fillColor('#15803d').fontSize(12).text('Payment successful', { align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor('#111827').fontSize(24).font('Helvetica-Bold').text('Booking Receipt', { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(11).fillColor('#4b5563').text('Your payment has been received and the booking is confirmed.', { align: 'center' });

  doc.moveDown(1.5);
  doc.roundedRect(48, doc.y, 499, 72, 10).fillAndStroke('#dcfce7', '#86efac');
  doc.fillColor('#14532d').fontSize(12).font('Helvetica-Bold').text('Booking summary', 64, doc.y + 14);
  doc.font('Helvetica').fillColor('#14532d').fontSize(11);
  doc.text(`Listing: ${record.listingTitle || listing?.title || 'Booked listing'}`, 64, doc.y + 8);
  doc.text(`Location: ${record.listingLocation || listing?.location || ''}${record.listingCountry || listing?.country ? `, ${record.listingCountry || listing?.country}` : ''}`, 64, doc.y + 4);

  const rowTop = doc.y + 18;
  const rows = [
    ['Booking ID', record.sessionId || record.paymentIntentId || ''],
    ['Days', String(bookingDays)],
    ['Reservation date', reservedAt],
    ['Payment method', paymentMethod],
  ];

  doc.moveTo(48, rowTop + 8).lineTo(547, rowTop + 8).stroke('#e5e7eb');
  let rowY = rowTop + 18;
  rows.forEach(([label, value], index) => {
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(10).text(label, 64, rowY + index * 22);
    doc.fillColor('#111827').font('Helvetica').fontSize(10).text(String(value || '-'), 300, rowY + index * 22, { width: 232, align: 'right' });
  });

  const amountTop = rowY + rows.length * 22 + 18;
  doc.roundedRect(48, amountTop, 499, 102, 10).fillAndStroke('#f0fdf4', '#bbf7d0');
  doc.fillColor('#14532d').font('Helvetica-Bold').fontSize(12).text('Receipt', 64, amountTop + 14);
  doc.fillColor('#14532d').font('Helvetica').fontSize(11);
  doc.text(`Subtotal`, 64, amountTop + 40);
  doc.text(`${currency} ${subtotal.toFixed(2)}`, 440, amountTop + 40, { width: 92, align: 'right' });
  doc.text(`Tax / GST`, 64, amountTop + 58);
  doc.text(`${currency} ${tax.toFixed(2)}`, 440, amountTop + 58, { width: 92, align: 'right' });
  doc.moveTo(64, amountTop + 76).lineTo(533, amountTop + 76).stroke('#bbf7d0');
  doc.font('Helvetica-Bold').text('Total paid', 64, amountTop + 84);
  doc.text(`${currency} ${subtotal.toFixed(2)}`, 440, amountTop + 84, { width: 92, align: 'right' });

  doc.moveDown(9);
  doc.fillColor('#6b7280').font('Helvetica').fontSize(10).text('You can view and manage your booking from your reservations page.', { align: 'left' });
  doc.moveDown(0.5);
  doc.fillColor('#111827').fontSize(10).text(`${process.env.APP_ORIGIN || ''}/listings/reservations`, { underline: true });

  doc.moveDown(2);
  doc.fillColor('#6b7280').fontSize(9).text('Wanderlust Private Limited', { align: 'center' });

  doc.end();
  await waitForFinish;
  return tmpPath;
};

const streamPdfFile = async (res, tmpPath, sessionId) => {
  const stat = await fs.promises.stat(tmpPath);

  if (!stat.size || stat.size < 500) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch (e) {
      /* ignore */
    }
    res.status(500).type('text/plain').send('PDF generation failed (empty or corrupted).');
    return false;
  }

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename=receipt-${sessionId}.pdf`,
    'Content-Length': stat.size,
  });

  const stream = fs.createReadStream(tmpPath);
  stream.pipe(res);
  stream.on('close', async () => {
    try { await fs.promises.unlink(tmpPath); } catch (e) { /* ignore */ }
  });
  stream.on('error', async (err) => {
    console.error('Stream error serving PDF:', err);
    try { await fs.promises.unlink(tmpPath); } catch (e) { /* ignore */ }
    if (!res.headersSent) res.status(500).type('text/plain').send('Error streaming PDF');
  });

  return true;
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


module.exports.renderPaymentPage = async (req, res) => {
  let { id } = req.params;
  return res.redirect(`/cart/${id}`);
};


module.exports.renderReservationsPage = async (req, res) => {
  const filters = {
    status: "paid",
    paymentStatus: "paid",
    lastEventType: { $in: ["checkout.session.completed", "checkout.session.async_payment_succeeded"] },
    $or: [
      { userId: String(req.user._id) },
      { customerEmail: req.user.email },
    ],
  };

  const paymentRecords = await PaymentRecord.find(filters)
    .sort({ createdAt: -1 })
    .lean();

  const listingIds = [...new Set(paymentRecords.map((record) => record.listingId).filter(Boolean))];
  const listings = await Listing.find({ _id: { $in: listingIds } }).lean();
  const listingsById = new Map(listings.map((listing) => [String(listing._id), listing]));

  const reservations = paymentRecords.map((record) => ({
    ...record,
    listing: listingsById.get(String(record.listingId)) || null,
  }));

  return res.render("listings/reservations.ejs", { reservations });
};


module.exports.renderReceipt = async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    req.flash("error", "Receipt not found");
    return res.redirect('/listings/reservations');
  }

  const record = await PaymentRecord.findOne({ sessionId }).lean();
  if (!record) {
    req.flash("error", "Receipt not found");
    return res.redirect('/listings/reservations');
  }

  // permission: buyer (userId or customerEmail) or listing owner
  const isBuyer = String(record.userId) === String(req.user._id) || String(record.customerEmail || '').toLowerCase() === String(req.user.email || '').toLowerCase();
  let listing = null;
  if (record.listingId) {
    listing = await Listing.findById(record.listingId).select('owner title location country').lean();
  }

  const isOwner = listing && listing.owner && String(listing.owner) === String(req.user._id);
  // fallback check: allow if buyer or owner
  if (!isBuyer && !isOwner) {
    req.flash('error', 'You do not have permission to view this receipt');
    return res.redirect('/listings/reservations');
  }

  const host = req.get('host');
  return res.render('listings/receipt.ejs', { record, listing, host });
};


module.exports.generateReceiptPdf = async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    req.flash('error', 'Receipt not found');
    return res.redirect('/listings/reservations');
  }

  const record = await PaymentRecord.findOne({ sessionId }).lean();
  if (!record) {
    req.flash('error', 'Receipt not found');
    return res.redirect('/listings/reservations');
  }

  let listing = null;
  if (record.listingId) {
    listing = await Listing.findById(record.listingId).select('owner title location country').lean();
  }

  const isBuyer = String(record.userId) === String(req.user._id) || String(record.customerEmail || '').toLowerCase() === String(req.user.email || '').toLowerCase();
  const isOwner = listing && listing.owner && String(listing.owner) === String(req.user._id);
  if (!isBuyer && !isOwner) {
    req.flash('error', 'You do not have permission to download this receipt');
    return res.redirect('/listings/reservations');
  }

  const fallbackPath = await buildReceiptPdfFallback({ record, listing, sessionId });
  const streamed = await streamPdfFile(res, fallbackPath, sessionId);
  if (streamed) {
    return;
  }

  res.status(500).type('text/plain').send('PDF generation failed');
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


module.exports.cancelReservation = async (req, res) => {
  const sessionId = String(req.params.sessionId || '').trim();
  if (!sessionId) {
    req.flash('error', 'Reservation not found');
    return res.redirect('/listings/reservations');
  }

  const record = await PaymentRecord.findOne({ sessionId }).lean();
  if (!record) {
    req.flash('error', 'Reservation not found');
    return res.redirect('/listings/reservations');
  }

  let listing = null;
  if (record.listingId) {
    listing = await Listing.findById(record.listingId).select('owner').lean();
  }

  const isBuyer = String(record.userId) === String(req.user._id) || String(record.customerEmail || '').toLowerCase() === String(req.user.email || '').toLowerCase();
  const isOwner = listing && listing.owner && String(listing.owner) === String(req.user._id);
  if (!isBuyer && !isOwner) {
    req.flash('error', 'You do not have permission to cancel this reservation');
    return res.redirect('/listings/reservations');
  }

  try {
    await sendBookingCancellationEmail(record);
  } catch (emailErr) {
    console.error('Error sending booking cancellation email:', emailErr);
  }

  const result = await PaymentRecord.deleteOne({ sessionId });
  if (!result || result.deletedCount === 0) {
    req.flash('error', 'Reservation could not be canceled');
    return res.redirect('/listings/reservations');
  }

  req.flash('success', 'Reservation canceled');
  return res.redirect('/listings/reservations');
};