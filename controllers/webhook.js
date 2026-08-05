const stripeFactory = require("stripe");
const { Resend } = require("resend");
const PaymentAttempt = require("../models/paymentAttempt.js");
const PaymentRecord = require("../models/paymentRecord.js");
const Listing = require("../models/listing.js");
const MyListing = require("../models/myListing.js");

const getStripe = () => {
  const secret =
    process.env.STRIPE_SECRET_KEY || process.env.WANDERLUST_STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing Stripe secret key");
  }
  return stripeFactory(secret);
};

const getWebhookSecret = () =>
  process.env.STRIPE_WEBHOOK_SECRET || process.env.WANDERLUST_STRIPE_WEBHOOK_SECRET;

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
};

const formatMoney = (amount, currency) => {
  const value = Number(amount || 0);
  const code = String(currency || "USD").toUpperCase();
  return value.toLocaleString("en-US", { style: "currency", currency: code });
};

const ejs = require("ejs");
const path = require("path");

const toDisplayDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
    .replace(/([A-Za-z]+)/, (match) => match.toUpperCase());
};

const getBookingRange = (record) => {
  const startRaw = record.bookingStartDate || record.reservationDate || null;
  const start = startRaw ? new Date(startRaw) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { bookingDays: record.bookingDays || 1, bookingStartText: "", bookingEndText: "" };
  }

  let end = record.bookingEndDate ? new Date(record.bookingEndDate) : null;
  if (!end || Number.isNaN(end.getTime())) {
    const daysFallback = Math.max(1, Number(record.bookingDays) || 1);
    // bookingDays is inclusive; reconstruct end as start + (days - 1)
    const offset = Math.max(0, daysFallback - 1);
    end = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
  }

  const toUtcDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((toUtcDay(end) - toUtcDay(start)) / (24 * 60 * 60 * 1000));
  const bookingDays = Math.max(1, diff + 1);

  return {
    bookingDays,
    bookingStartText: toDisplayDate(start),
    bookingEndText: toDisplayDate(end),
  };
};

const getAppOrigin = () => (process.env.BASEURL || process.env.APP_ORIGIN || "").replace(/\/$/, "");
const getEmailOrigin = () => (process.env.EMAIL_URL || process.env.BASEURL || process.env.APP_ORIGIN || "").replace(/\/$/, "");

const parseHostname = (origin) => {
  if (!origin) {
    return "";
  }
  try {
    return new URL(origin).hostname;
  } catch (err) {
    return String(origin).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
};

const getResendFromAddress = (envValue, appOrigin, fallbackLocalPart) => {
  if (envValue && String(envValue).trim()) {
    return String(envValue).trim();
  }
  const host = parseHostname(appOrigin);
  if (!host) {
    throw new Error(
      `Cannot determine sender address for ${fallbackLocalPart}. Set RESEND_FROM_EMAIL or EMAIL_URL/BASEURL/APP_ORIGIN.`
    );
  }
  return `Wanderlust Private Limited <${fallbackLocalPart}@${host}>`;
};

const findListingOwner = async (record) => {
  if (!record?.listingId) {
    return null;
  }

  try {
    const listing = await Listing.findById(record.listingId)
      .select("title owner")
      .populate("owner", "email displayName")
      .lean();
    if (!listing || !listing.owner || !listing.owner.email) {
      return null;
    }

    return {
      ownerEmail: String(listing.owner.email).trim(),
      ownerName: listing.owner.displayName || "",
      listingTitle: listing.title || record.listingTitle || "",
    };
  } catch (err) {
    console.error("Error finding listing owner for booking notification:", err);
    return null;
  }
};

const buildBookingEmail = async (record) => {
  const listingTitle = record.listingTitle || "Booked listing";
  const { bookingDays, bookingStartText, bookingEndText } = getBookingRange(record);
  const currency = record.originalCurrency || record.localCurrency || record.currency || "USD";
  const totalValue = record.originalAmountTotal ?? record.localAmountTotal ?? record.amountTotal ?? 0;
  const total = (Number(totalValue) || 0).toFixed(2);
  const reservedAt = record.reservationDate ? new Date(record.reservationDate).toLocaleString() : "";
  const bookingId = record.sessionId || record.paymentIntentId || "";
  const subtotal = total; // no itemized breakdown available here
  const tax = "0.00";
  const paymentMethod = Array.isArray(record.paymentMethodTypes) && record.paymentMethodTypes.length > 0 ? record.paymentMethodTypes[0] : "card";
  const appOrigin = getAppOrigin();
  const bookingUrl = appOrigin ? `${appOrigin}/listings/reservations` : '/listings/reservations';
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    `booking-confirmation@${parseHostname(getEmailOrigin())}`;
  const logoUrl = process.env.LOGO_URL || "https://your-cdn.example/logo.png";

  const subject = `Booking confirmed: ${listingTitle}`;

  const templatePath = path.join(__dirname, "..", "views", "emails", "bookingconfirmation.ejs");
  const html = await ejs.renderFile(templatePath, {
    listingTitle,
    bookingDays,
    currency,
    total,
    reservationDate: reservedAt,
    bookingStartDate: bookingStartText,
    bookingEndDate: bookingEndText,
    bookingId,
    subtotal,
    tax,
    paymentMethod,
    bookingUrl,
    supportEmail,
    logoUrl,
    listingLocation: record.listingLocation || "",
    listingCountry: record.listingCountry || "",
    customerName: record.customerName || "",
  });

  const text = `Booking confirmed: ${listingTitle} - Booking #${bookingId}\n\nHello ${record.customerName || 'Guest'},\n\nThank you — your booking is confirmed.\n\nListing: ${listingTitle}\nLocation: ${record.listingLocation || ''}${record.listingCountry ? ', ' + record.listingCountry : ''}\nBooking dates: ${bookingStartText}${bookingEndText ? ' to ' + bookingEndText : ''}\nNights: ${bookingDays}\nReservation date: ${reservedAt}\nPayment method: ${paymentMethod}\n\nReceipt:\n  Subtotal: ${currency} ${subtotal}\n  Tax / GST: ${currency} ${tax}\n  Total paid: ${currency} ${total}\n\nView your booking: ${bookingUrl}\n\nIf you have questions, contact ${supportEmail}.\n\nThanks,\nWanderlust Private Limited`;

  return { subject, html, text };
};

const buildOwnerBookingEmail = async (record, ownerInfo = {}) => {
  const listingTitle = record.listingTitle || ownerInfo.listingTitle || "Your listing";
  const { bookingDays, bookingStartText, bookingEndText } = getBookingRange(record);
  const currency = record.originalCurrency || record.localCurrency || record.currency || "USD";
  const totalValue = record.originalAmountTotal ?? record.localAmountTotal ?? record.amountTotal ?? 0;
  const total = (Number(totalValue) || 0).toFixed(2);
  const reservedAt = record.reservationDate ? new Date(record.reservationDate).toLocaleString() : "";
  const bookingId = record.sessionId || record.paymentIntentId || "";
  const appOrigin = getAppOrigin();
  const ordersUrl = record.listingId
    ? appOrigin
      ? `${appOrigin}/listings/mylistings/${record.listingId}/orders`
      : `/listings/mylistings/${record.listingId}/orders`
    : appOrigin
    ? `${appOrigin}/listings/mylistings`
    : "/listings/mylistings";
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    `booking-confirmation@${parseHostname(getEmailOrigin())}`;
  const logoUrl = process.env.LOGO_URL || "https://your-cdn.example/logo.png";
  const ownerName = ownerInfo.ownerName || "Host";
  const guestName = record.customerName || "Guest";
  const guestEmail = record.customerEmail || "";

  const subject = `New booking received: ${listingTitle}`;

  const templatePath = path.join(__dirname, "..", "views", "emails", "bookingownernotification.ejs");
  const html = await ejs.renderFile(templatePath, {
    ownerName,
    guestName,
    guestEmail,
    listingTitle,
    listingLocation: record.listingLocation || "",
    listingCountry: record.listingCountry || "",
    bookingDays,
    currency,
    total,
    reservationDate: reservedAt,
    bookingStartDate: bookingStartText,
    bookingEndDate: bookingEndText,
    bookingId,
    ordersUrl,
    supportEmail,
    logoUrl,
  });

  const text = `New booking received for ${listingTitle} (Booking #${bookingId})\n\nHello ${ownerName},\n\nA guest has confirmed a new booking for your listing.\n\nGuest: ${guestName}${guestEmail ? ` <${guestEmail}>` : ""}\nLocation: ${record.listingLocation || ""}${record.listingCountry ? ", " + record.listingCountry : ""}\nBooking dates: ${bookingStartText}${bookingEndText ? " to " + bookingEndText : ""}\nNights: ${bookingDays}\nReservation date: ${reservedAt}\nTotal paid: ${currency} ${total}\n\nView the order: ${ordersUrl}\n\nIf you have questions, contact ${supportEmail}.\n\nThanks,\nWanderlust Private Limited`;

  return { subject, html, text };
};

const buildCancellationEmail = async (record) => {
  const listingTitle = record.listingTitle || "Booked listing";
  const { bookingDays, bookingStartText, bookingEndText } = getBookingRange(record);
  const currency = record.originalCurrency || record.localCurrency || record.currency || "USD";
  const totalValue = record.originalAmountTotal ?? record.localAmountTotal ?? record.amountTotal ?? 0;
  const total = (Number(totalValue) || 0).toFixed(2);
  const canceledAt = new Date().toLocaleString();
  const bookingId = record.sessionId || record.paymentIntentId || "";
  const appOrigin = getEmailOrigin();
  const listingsUrl = appOrigin ? `${appOrigin}/listings` : "/listings";
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    `booking-cancel@${appOrigin.replace(/^https?:\/\//, '')}`;
  const logoUrl = process.env.LOGO_URL || "https://your-cdn.example/logo.png";

  const subject = `Booking canceled: ${listingTitle}`;

  const templatePath = path.join(__dirname, "..", "views", "emails", "bookingcancel.ejs");
  const html = await ejs.renderFile(templatePath, {
    listingTitle,
    bookingDays,
    currency,
    total,
    bookingStartDate: bookingStartText,
    bookingEndDate: bookingEndText,
    bookingId,
    canceledAt,
    supportEmail,
    logoUrl,
    listingLocation: record.listingLocation || "",
    listingCountry: record.listingCountry || "",
    customerName: record.customerName || "",
    listingsUrl,
  });

  const text = `Booking canceled: ${listingTitle} - Booking #${bookingId}\n\nHello ${record.customerName || 'Guest'},\n\nYour reservation has been canceled successfully.\n\nListing: ${listingTitle}\nLocation: ${record.listingLocation || ''}${record.listingCountry ? ', ' + record.listingCountry : ''}\nBooking dates: ${bookingStartText}${bookingEndText ? ' to ' + bookingEndText : ''}\nNights: ${bookingDays}\nCanceled at: ${canceledAt}\nTotal paid: ${currency} ${total}\n\nIf you have questions, contact ${supportEmail}.\n\nThanks,\nWanderlust Private Limited`;

  return { subject, html, text };
};

const sendBookingEmail = async (record, force = false) => {
  if (!record) {
    return;
  }

  const resend = getResend();
  if (!resend) {
    throw new Error("Missing Resend API key for booking emails");
  }

  const appOrigin = getEmailOrigin();
  const fromCustomer = getResendFromAddress(
    process.env.RESEND_FROM_EMAIL,
    appOrigin,
    "booking-confirmation"
  );
  const fromOwner = getResendFromAddress(
    process.env.RESEND_OWNER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL,
    appOrigin,
    "booking-owner"
  );

  const ownerInfo = await findListingOwner(record);
  const customerEmail = record.customerEmail ? String(record.customerEmail).trim() : null;
  const ownerEmail = ownerInfo?.ownerEmail ? String(ownerInfo.ownerEmail).trim() : null;

  const shouldSendCustomer = customerEmail && (!record.emailSentAt || force);
  const shouldSendOwner = ownerEmail && (!record.ownerEmailSentAt || force) && ownerEmail !== customerEmail;

  if (!shouldSendCustomer && !shouldSendOwner) {
    return;
  }

  if (shouldSendCustomer) {
    const { subject, html, text } = await buildBookingEmail(record);
    await resend.emails.send({
      from: fromCustomer,
      to: [customerEmail],
      subject,
      html,
      text,
    });
    await PaymentRecord.updateOne(
      { sessionId: record.sessionId },
      { $set: { emailSentAt: new Date(), emailSentTo: customerEmail } }
    );
  }

  if (shouldSendOwner) {
    const { subject, html, text } = await buildOwnerBookingEmail(record, ownerInfo);
    await resend.emails.send({
      from: fromOwner,
      to: [ownerEmail],
      subject,
      html,
      text,
    });
    await PaymentRecord.updateOne(
      { sessionId: record.sessionId },
      { $set: { ownerEmailSentAt: new Date(), ownerEmailSentTo: ownerEmail } }
    );
  }
};

const sendBookingCancellationEmail = async (record, force = false) => {
  if (!record) {
    return;
  }

  const resend = getResend();
  if (!resend) {
    throw new Error("Missing Resend API key for cancellation emails");
  }

  const to = record.customerEmail ? String(record.customerEmail).trim() : null;
  if (!to) {
    throw new Error("No customer email available for booking cancellation notification");
  }

  const appOrigin = getEmailOrigin();
  const from = getResendFromAddress(
    process.env.RESEND_CANCEL_FROM_EMAIL || process.env.RESEND_FROM_EMAIL,
    appOrigin,
    "booking-cancel"
  );
  const { subject, html, text } = await buildCancellationEmail(record);

  await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    text,
  });

  await PaymentRecord.updateOne(
    { sessionId: record.sessionId },
    { $set: { cancellationEmailSentAt: new Date(), cancellationEmailSentTo: to } }
  );
};

const upsertPaymentAttempt = async ({ sessionId, paymentIntentId, status, paymentStatus, eventType }) => {
  const update = {
    status,
    paymentStatus,
    lastEventType: eventType,
  };

  if (sessionId) {
    await PaymentAttempt.findOneAndUpdate(
      { sessionId },
      { sessionId, ...update },
      { upsert: true, new: true }
    );
    return;
  }

  if (paymentIntentId) {
    await PaymentAttempt.findOneAndUpdate(
      { paymentIntentId },
      { paymentIntentId, ...update },
      { upsert: true, new: true }
    );
  }
};

const updateMyListingTotals = async (record) => {
  if (!record || !record.listingId) {
    return;
  }

  const listingId = String(record.listingId);
  const amount = Number(record.localAmountTotal ?? record.amountTotal ?? 0);
  const currency = String(record.localCurrency || record.currency || "").toUpperCase();

  let myListing = await MyListing.findOne({ listingId }).lean();
  if (!myListing) {
    const listing = await Listing.findById(listingId)
      .select("owner title price location")
      .populate("owner")
      .lean();
    if (!listing) {
      return;
    }

    const ownerEmail = listing.owner && listing.owner.email ? String(listing.owner.email).trim() : "";

    await MyListing.create({
      userId: listing.owner && listing.owner._id ? listing.owner._id : listing.owner,
      userEmail: ownerEmail,
      listingId: listing._id,
      listingName: listing.title,
      price: listing.price,
      location: listing.location,
      totalOrders: 0,
      totalPaid: 0,
      totalPaidCurrency: currency || "",
      status: "active",
    });

    myListing = await MyListing.findOne({ listingId }).lean();
  }

  let nextCurrency = myListing?.totalPaidCurrency || "";
  if (!nextCurrency && currency) {
    nextCurrency = currency;
  } else if (currency && nextCurrency && nextCurrency !== currency) {
    nextCurrency = "MULTI";
  }

  await MyListing.updateOne(
    { listingId },
    {
      $inc: {
        totalOrders: 1,
        totalPaid: Number.isFinite(amount) ? amount : 0,
      },
      $set: {
        totalPaidCurrency: nextCurrency,
      },
    }
  );
};

const upsertPaymentRecord = async ({ session, status, eventType }) => {
  if (!session?.id) {
    return;
  }

  const existingRecord = await PaymentRecord.findOne({ sessionId: session.id }).lean();

  const record = {
    sessionId: session.id,
    paymentIntentId: session.payment_intent || null,
    amountTotal: Number(session.amount_total || 0) / 100,
    usdAmountTotal:
      String(session.currency || "").toUpperCase() === "USD"
        ? Number(session.amount_total || 0) / 100
        : null,
    localAmountTotal: session.metadata?.localAmount
      ? Number(session.metadata.localAmount)
      : null,
    localCurrency: session.metadata?.localCurrency
      ? String(session.metadata.localCurrency).toUpperCase()
      : null,
    originalAmountTotal: session.metadata?.localAmount
      ? Number(session.metadata.localAmount)
      : Number(session.amount_total || 0) / 100,
    originalCurrency: session.metadata?.localCurrency
      ? String(session.metadata.localCurrency).toUpperCase()
      : String(session.currency || "").toUpperCase(),
    currency: String(session.currency || "").toUpperCase(),
    paymentStatus: session.payment_status || null,
    status,
    customerEmail:
      session.metadata?.customerEmail ||
      session.customer_details?.email ||
      session.customer_email ||
      null,
    customerName: session.customer_details?.name || null,
    userId: session.metadata?.userId || null,
    listingId: session.metadata?.listingId || null,
    listingTitle: session.metadata?.listingTitle || null,
    listingLocation: session.metadata?.listingLocation || null,
    listingCountry: session.metadata?.listingCountry || null,
    bookingDays: session.metadata?.days ? Number(session.metadata.days) : null,
    bookingStartDate: session.metadata?.bookingStartDate
      ? new Date(session.metadata.bookingStartDate)
      : null,
    bookingEndDate: session.metadata?.bookingEndDate
      ? new Date(session.metadata.bookingEndDate)
      : null,
    reservationDate: session.created ? new Date(session.created * 1000) : null,
    paymentMethodTypes: Array.isArray(session.payment_method_types)
      ? session.payment_method_types
      : [],
    sessionCreatedAt: session.created ? new Date(session.created * 1000) : null,
    lastEventType: eventType,
  };

  const savedRecord = await PaymentRecord.findOneAndUpdate(
    { sessionId: session.id },
    { $set: record },
    { upsert: true, new: true }
  );

  if (status === "paid" && (!existingRecord || existingRecord.status !== "paid")) {
    await updateMyListingTotals(savedRecord);
  }

  return savedRecord;
};

const handleStripeWebhook = async (req, res) => {
  let event;
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) {
    return res.status(500).send("Missing Stripe webhook secret");
  }

  try {
    const stripe = getStripe();
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await upsertPaymentAttempt({
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
          status: "paid",
          paymentStatus: session.payment_status,
          eventType: event.type,
        });
        const paymentRecord = await upsertPaymentRecord({
          session,
          status: "paid",
          eventType: event.type,
        });
        await sendBookingEmail(paymentRecord);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        await upsertPaymentAttempt({
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
          status: "failed",
          paymentStatus: session.payment_status,
          eventType: event.type,
        });
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        await upsertPaymentAttempt({
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
          status: "paid",
          paymentStatus: session.payment_status,
          eventType: event.type,
        });
        const paymentRecord = await upsertPaymentRecord({
          session,
          status: "paid",
          eventType: event.type,
        });
        await sendBookingEmail(paymentRecord);
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        await upsertPaymentAttempt({
          paymentIntentId: paymentIntent.id,
          status: "failed",
          paymentStatus: paymentIntent.status,
          eventType: event.type,
        });
        break;
      }
      default:
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    return res.status(500).send(`Webhook handler error: ${error.message}`);
  }
};

module.exports = {
  handleStripeWebhook,
  sendBookingEmail,
  buildBookingEmail,
  sendBookingCancellationEmail,
  buildCancellationEmail,
};
