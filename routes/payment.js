const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware.js");
const { resendBookingConfirmation, testSend } = require("../controllers/payment.js");

// POST /payments/resend-confirmation
router.post("/resend-confirmation", isLoggedIn, resendBookingConfirmation);

// POST /payments/test-send
router.post("/test-send", isLoggedIn, testSend);

module.exports = router;
