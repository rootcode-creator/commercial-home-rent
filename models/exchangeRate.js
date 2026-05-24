const mongoose = require("mongoose");

const exchangeRateSchema = new mongoose.Schema({
  base: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  rates: {
    type: Map,
    of: Number,
    default: {},
  },
  fetchedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  fetchedDate: {
    type: String,
    required: true,
  },
});

exchangeRateSchema.index({ base: 1, fetchedDate: 1 }, { unique: true });

module.exports = mongoose.model("ExchangeRate", exchangeRateSchema);
