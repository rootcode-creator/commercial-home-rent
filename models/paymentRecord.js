const mongoose = require("mongoose");

const paymentRecordSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      index: true,
      unique: true,
      trim: true,
      required: true,
    },
    paymentIntentId: {
      type: String,
      index: true,
      trim: true,
    },
    amountTotal: {
      type: Number,
      required: true,
    },
    usdAmountTotal: {
      type: Number,
    },
    localAmountTotal: {
      type: Number,
    },
    localCurrency: {
      type: String,
      uppercase: true,
      trim: true,
    },
    originalAmountTotal: {
      type: Number,
    },
    originalCurrency: {
      type: String,
      uppercase: true,
      trim: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    paymentStatus: {
      type: String,
    },
    status: {
      type: String,
      required: true,
    },
    customerEmail: {
      type: String,
      trim: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    userId: {
      type: String,
      index: true,
      trim: true,
    },
    listingId: {
      type: String,
      index: true,
      trim: true,
    },
    listingTitle: {
      type: String,
      trim: true,
    },
    listingLocation: {
      type: String,
      trim: true,
    },
    listingCountry: {
      type: String,
      trim: true,
    },
    bookingDays: {
      type: Number,
    },
    bookingStartDate: {
      type: Date,
    },
    bookingEndDate: {
      type: Date,
    },
    reservationDate: {
      type: Date,
    },
    paymentMethodTypes: {
      type: [String],
      default: [],
    },
    sessionCreatedAt: {
      type: Date,
    },
    lastEventType: {
      type: String,
    },
    emailSentAt: {
      type: Date,
    },
    emailSentTo: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentRecord", paymentRecordSchema);
