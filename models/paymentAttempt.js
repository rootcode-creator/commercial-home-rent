const mongoose = require("mongoose");

const paymentAttemptSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
      trim: true,
    },
    paymentIntentId: {
      type: String,
      index: true,
      sparse: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
    },
    paymentStatus: {
      type: String,
    },
    lastEventType: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentAttempt", paymentAttemptSchema);
