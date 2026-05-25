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

const buildBookingEmail = async (record) => {
  const listingTitle = record.listingTitle || "Booked listing";
  const bookingDays = record.bookingDays || 1;
  const currency = record.originalCurrency || record.localCurrency || record.currency || "USD";
  const totalValue = record.originalAmountTotal ?? record.localAmountTotal ?? record.amountTotal ?? 0;
  const total = (Number(totalValue) || 0).toFixed(2);
  const reservedAt = record.reservationDate ? new Date(record.reservationDate).toLocaleString() : "";
  const bookingId = record.sessionId || record.paymentIntentId || "";
  const subtotal = total; // no itemized breakdown available here
  const tax = "0.00";
  const paymentMethod = Array.isArray(record.paymentMethodTypes) && record.paymentMethodTypes.length > 0 ? record.paymentMethodTypes[0] : "card";
  const appOrigin = (process.env.BASEURL || process.env.APP_ORIGIN || "https://home-rent.kawserahmed.tech").replace(/\/$/, "");
  const bookingUrl = `${appOrigin}/listings/reservations`;
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    "booking-confirmation@wanderlust.kawserahmed.tech";
  const logoUrl = process.env.LOGO_URL || "https://your-cdn.example/logo.png";

  const subject = `Booking confirmed: ${listingTitle}`;

  const templatePath = path.join(__dirname, "..", "views", "emails", "bookingconfirmation.ejs");
  const html = await ejs.renderFile(templatePath, {
    listingTitle,
    bookingDays,
    currency,
    total,
    reservationDate: reservedAt,
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

  const text = `Booking confirmed: ${listingTitle} - Booking #${bookingId}\n\nHello ${record.customerName || 'Guest'},\n\nThank you — your booking is confirmed.\n\nListing: ${listingTitle}\nLocation: ${record.listingLocation || ''}${record.listingCountry ? ', ' + record.listingCountry : ''}\nDays: ${bookingDays}\nReservation date: ${reservedAt}\nPayment method: ${paymentMethod}\n\nReceipt:\n  Subtotal: ${currency} ${subtotal}\n  Tax / GST: ${currency} ${tax}\n  Total paid: ${currency} ${total}\n\nView your booking: ${bookingUrl}\n\nIf you have questions, contact ${supportEmail}.\n\nThanks,\nWanderlust Private Limited`;

  return { subject, html, text };
};

const buildCancellationEmail = async (record) => {
  const listingTitle = record.listingTitle || "Booked listing";
  const bookingDays = record.bookingDays || 1;
  const currency = record.originalCurrency || record.localCurrency || record.currency || "USD";
  const totalValue = record.originalAmountTotal ?? record.localAmountTotal ?? record.amountTotal ?? 0;
  const total = (Number(totalValue) || 0).toFixed(2);
  const canceledAt = new Date().toLocaleString();
  const bookingId = record.sessionId || record.paymentIntentId || "";
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    "booking-cancel@wanderlust.kawserahmed.tech";
  const logoUrl = process.env.LOGO_URL || "https://your-cdn.example/logo.png";

  const subject = `Booking canceled: ${listingTitle}`;

  const templatePath = path.join(__dirname, "..", "views", "emails", "bookingcancel.ejs");
  const html = await ejs.renderFile(templatePath, {
    listingTitle,
    bookingDays,
    currency,
    total,
    bookingId,
    canceledAt,
    supportEmail,
    logoUrl,
    listingLocation: record.listingLocation || "",
    listingCountry: record.listingCountry || "",
    customerName: record.customerName || "",
  });

  const text = `Booking canceled: ${listingTitle} - Booking #${bookingId}\n\nHello ${record.customerName || 'Guest'},\n\nYour reservation has been canceled successfully.\n\nListing: ${listingTitle}\nLocation: ${record.listingLocation || ''}${record.listingCountry ? ', ' + record.listingCountry : ''}\nDays: ${bookingDays}\nCanceled at: ${canceledAt}\nTotal paid: ${currency} ${total}\n\nIf you have questions, contact ${supportEmail}.\n\nThanks,\nWanderlust Private Limited`;

  return { subject, html, text };
};

const sendBookingEmail = async (record, force = false) => {
  if (!record || (record.emailSentAt && !force)) {
    return;
  }

  const resend = getResend();
  if (!resend) {
    return;
  }

  const to = record.customerEmail;
  if (!to) {
    return;
  }

  const from =
    process.env.RESEND_FROM_EMAIL ||
    "Wanderlust Private Limited <booking-confirmation@wanderlust.kawserahmed.tech>";
  const { subject, html, text } = await buildBookingEmail(record);

  await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    text,
  });

  await PaymentRecord.updateOne(
    { sessionId: record.sessionId },
    { $set: { emailSentAt: new Date(), emailSentTo: to } }
  );
};

const sendBookingCancellationEmail = async (record, force = false) => {
  if (!record || (record.cancellationEmailSentAt && !force)) {
    return;
  }

  const resend = getResend();
  if (!resend) {
    return;
  }

  const to = record.customerEmail;
  if (!to) {
    return;
  }

  const from =
    process.env.RESEND_CANCEL_FROM_EMAIL ||
    "Wanderlust Private Limited <booking-cancel@wanderlust.kawserahmed.tech>";
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
