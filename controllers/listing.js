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
    ? record.paymentMethodTypes.join(', ')
    : 'card';
  const bookingDays = record.bookingDays || 1;
  const reservedAt = record.reservationDate ? new Date(record.reservationDate).toLocaleString() : '';
  const invoiceId = String(record.sessionId || record.paymentIntentId || '').slice(0, 12);
  const displayName = record.customerName || 'Guest';
  const displayEmail = record.customerEmail || 'N/A';
  const displayLocation = `${record.listingLocation || listing?.location || ''}${record.listingCountry || listing?.country ? `, ${record.listingCountry || listing?.country}` : ''}`.trim();
  const displayTitle = record.listingTitle || listing?.title || 'Booked listing';
  const siteOrigin = (process.env.BASEURL || process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const siteLabel = siteOrigin ? siteOrigin.replace(/^https?:\/\//, '') : '';

  const getDisplayUsdAmount = (valueRecord) => {
    const usd = Number(valueRecord?.usdAmountTotal);
    const base = Number(valueRecord?.amountTotal);
    const originalCurrency = String(valueRecord?.originalCurrency || valueRecord?.localCurrency || '').toUpperCase();

    if (Number.isFinite(usd)) {
      if (Number.isFinite(base) && Math.abs(usd - (base * 100)) < 0.001) {
        return base;
      }
      const usdIsWhole = Math.abs(usd - Math.trunc(usd)) < 0.000001;
      if (usdIsWhole && usd >= 1000 && originalCurrency && originalCurrency !== 'USD') {
        return usd / 100;
      }
      return usd;
    }

    if (String(valueRecord?.currency || '').toUpperCase() === 'USD' && Number.isFinite(base)) {
      const baseIsWhole = Math.abs(base - Math.trunc(base)) < 0.000001;
      if (baseIsWhole && base >= 1000 && originalCurrency && originalCurrency !== 'USD') {
        return base / 100;
      }
      return base;
    }

    return null;
  };

  const waitForFinish = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const left = 48;
  const right = pageWidth - 48;
  const contentWidth = right - left;
  let y = 48;

  const logoPath = path.join(__dirname, '..', 'public', 'images', 'snowflakes.png');
  const signaturePath = path.join(__dirname, '..', 'public', 'images', 'signature.png');
  let logoWidth = 0;

  try {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, left, y, { width: 28, height: 28 });
      logoWidth = 36;
    }
  } catch (e) {
    logoWidth = 0;
  }

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(18).text('Invoice', left + logoWidth, y - 2);
  doc.font('Helvetica-Bold').fontSize(10.5).text('Wanderlust Private Limited', left + logoWidth, y + 18);
  if (siteLabel) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text('Website:', left, y - 2, { width: contentWidth, align: 'right' });
    doc.text(siteLabel, left, y + 12, { width: contentWidth, align: 'right' });
  }

  y += 72;

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('Invoice To', left, y);
  doc.font('Helvetica-Bold').fontSize(10).text(displayName, left, y + 16);
  doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text(displayEmail, left, y + 32);
  doc.text(displayLocation || ' ', left, y + 46);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`Invoice # ${invoiceId}`, left, y, { width: contentWidth, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text(`Date: ${record.reservationDate ? new Date(record.reservationDate).toLocaleDateString() : new Date().toLocaleDateString()}`, left, y + 16, { width: contentWidth, align: 'right' });
  doc.text(`Booked For: ${bookingDays} day(s)`, left, y + 32, { width: contentWidth, align: 'right' });

  y += 76;

  const tableTop = y;
  const headerHeight = 32;
  const rowHeight = 60;
  const colSl = 40;
  const colDesc = 220;
  const colPrice = 110;
  const colDays = 70;
  const colTotal = contentWidth - (colSl + colDesc + colPrice + colDays);

  const colX = {
    sl: left,
    desc: left + colSl,
    price: left + colSl + colDesc,
    days: left + colSl + colDesc + colPrice,
    total: left + colSl + colDesc + colPrice + colDays,
  };

  doc.rect(left, tableTop, contentWidth, headerHeight).fill('#f3f4f6');
  doc.rect(left, tableTop, contentWidth, headerHeight + rowHeight).stroke('#d1d5db');
  doc.strokeColor('#d1d5db');
  doc.moveTo(colX.desc, tableTop).lineTo(colX.desc, tableTop + headerHeight + rowHeight).stroke();
  doc.moveTo(colX.price, tableTop).lineTo(colX.price, tableTop + headerHeight + rowHeight).stroke();
  doc.moveTo(colX.days, tableTop).lineTo(colX.days, tableTop + headerHeight + rowHeight).stroke();
  doc.moveTo(colX.total, tableTop).lineTo(colX.total, tableTop + headerHeight + rowHeight).stroke();

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9.5);
  doc.text('SL', colX.sl + 8, tableTop + 7);
  doc.text('Item Description', colX.desc + 8, tableTop + 7);
  doc.text('Price', colX.price + 8, tableTop + 7);
  doc.text('Days', colX.days + 8, tableTop + 7);
  doc.text('Total', colX.total + 8, tableTop + 7);

  const rowY = tableTop + headerHeight;
  doc.fillColor('#111827').font('Helvetica').fontSize(9.5);
  doc.text('1', colX.sl + 10, rowY + 10);
  doc.font('Helvetica-Bold').text(displayTitle, colX.desc + 8, rowY + 10, { width: colDesc - 16 });
  doc.fillColor('#111827').fontSize(9.5).text(`${subtotal.toFixed(2)} ${currency}`, colX.price + 8, rowY + 14, { width: colPrice - 16, align: 'right' });
  doc.text(String(bookingDays), colX.days + 8, rowY + 14, { width: colDays - 16, align: 'center' });
  doc.text(`${subtotal.toFixed(2)} ${currency}`, colX.total + 8, rowY + 14, { width: colTotal - 16, align: 'right' });

  y = tableTop + headerHeight + rowHeight + 24;

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('Payment Method', left, y);
  doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text(paymentMethod, left, y + 14);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Customer Email', left, y + 38);
  doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text(displayEmail, left, y + 52);

  const summaryWidth = 210;
  const summaryX = right - summaryWidth;
  doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text('Subtotal', summaryX, y, { width: summaryWidth - 60 });
  doc.fillColor('#111827').text(`${subtotal.toFixed(2)} ${currency}`, summaryX, y, { width: summaryWidth, align: 'right' });
  doc.fillColor('#6b7280').text('Taxes', summaryX, y + 16, { width: summaryWidth - 60 });
  doc.fillColor('#111827').text('0.00%', summaryX, y + 16, { width: summaryWidth, align: 'right' });
  doc.fillColor('#6b7280').text('Discount', summaryX, y + 32, { width: summaryWidth - 60 });
  doc.fillColor('#111827').text('0.00%', summaryX, y + 32, { width: summaryWidth, align: 'right' });

  const totalRowY = y + 48;
  doc.rect(summaryX, totalRowY - 2, summaryWidth, 18).fill('#f3f4f6');
  doc.fillColor('#111827').font('Helvetica-Bold').text('Total', summaryX + 6, totalRowY, { width: summaryWidth - 12 });
  doc.text(`${subtotal.toFixed(2)} ${currency}`, summaryX, totalRowY, { width: summaryWidth - 6, align: 'right' });

  const usdAmount = getDisplayUsdAmount(record);
  if (usdAmount !== null && usdAmount !== undefined) {
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Equivalent USD: ${usdAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
      summaryX, totalRowY + 24, { width: summaryWidth, align: 'right' });
  }

  y += 90;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('Terms & Conditions / Notes', left, y);

  try {
    if (fs.existsSync(signaturePath)) {
      doc.image(signaturePath, right - 140, y + 6, { width: 120, height: 36 });
    }
  } catch (e) {
    /* ignore */
  }
  doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text('Wanderlust Private Limited', right - 140, y + 52, { width: 120, align: 'center' });

  const footerY = doc.page.height - 90;
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Contact: info@wanderlust.com • +1 (212) 555-0123', left, footerY, { width: contentWidth, align: 'center' });
  doc.text('Address: 123 Wanderlust Ave, New York, NY 10001, USA', left, footerY + 14, { width: contentWidth, align: 'center' });

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