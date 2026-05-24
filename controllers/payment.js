const PaymentRecord = require("../models/paymentRecord.js");
const { sendBookingEmail } = require("./webhook.js");
const { Resend } = require("resend");

const resendBookingConfirmation = async (req, res) => {
  try {
    const { sessionId, paymentIntentId, force } = req.body || {};

    let record = null;
    if (sessionId) {
      record = await PaymentRecord.findOne({ sessionId });
    }
    if (!record && paymentIntentId) {
      record = await PaymentRecord.findOne({ paymentIntentId });
    }
    if (!record) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    await sendBookingEmail(record, !!force);

    return res.json({ success: true, resentTo: record.customerEmail || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /payments/test-send
// body: { apiKey?: string, from: string, to: [string], subject: string, html?: string, text?: string }
const testSend = async (req, res) => {
  try {
    const { apiKey, from, to, subject, html, text } = req.body || {};
    const key = apiKey || process.env.RESEND_API_KEY;
    if (!key) {
      return res.status(400).json({ error: "Missing Resend API key" });
    }

    if (!from || !to || !subject) {
      return res.status(400).json({ error: "Missing required fields: from, to, subject" });
    }

    const resend = new Resend(key);
    await resend.emails.send({ from, to: Array.isArray(to) ? to : [to], subject, html, text });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = { resendBookingConfirmation, testSend };
