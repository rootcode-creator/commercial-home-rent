const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const cartController = require("../controllers/cart.js");
const PaymentRecord = require("../models/paymentRecord.js");
const Listing = require("../models/listing.js");
const { isLoggedIn } = require("../middleware.js");
const { getUsdRateFor, getUsdRatesFor } = require("../utils/exchangeRates.js");
const { sendBookingEmail } = require("../controllers/webhook.js");

router.get(
	"/exchange-rates",
	isLoggedIn,
	wrapAsync(async (req, res) => {
		const symbols = String(req.query.symbols || "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean);

		if (symbols.length === 0) {
			return res.status(400).json({ error: "symbols query param is required" });
		}

		try {
			const payload = await getUsdRatesFor(symbols);
			return res.json(payload);
		} catch (error) {
			return res.status(500).json({ error: error.message || "Exchange rate error" });
		}
	})
);

// Create checkout session from an array of products in the request body
router.post(
	"/create-checkout-session",
	isLoggedIn,
	wrapAsync(async (req, res) => {
		const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.WANDERLUST_STRIPE_SECRET_KEY;
		if (!stripeSecret) {
			return res.status(500).json({ error: "Missing Stripe secret key" });
		}

		const stripe = require("stripe")(stripeSecret);

		const { products } = req.body || {};
		if (!Array.isArray(products) || products.length === 0) {
			return res.status(400).json({ error: "Products array is required" });
		}

		const line_items = [];
		let localAmountTotal = 0;
		let localCurrency = null;
		for (const product of products) {
			const name = String(product.name || "").trim();
			const baseAmount = Number(product.price || 0);
			const quantity = Math.max(1, Number(product.quantity || 1));
			const inputCurrency = String(product.currency || "usd").toLowerCase();
			if (!name || !Number.isFinite(baseAmount) || baseAmount <= 0) {
				return res.status(400).json({ error: "Invalid product data" });
			}

			let stripeCurrency = inputCurrency;
			let unitAmount = Math.round(baseAmount * 100);
			if (inputCurrency !== "usd") {
				const usdRate = await getUsdRateFor(inputCurrency);
				const usdAmount = baseAmount / usdRate;
				unitAmount = Math.round(usdAmount * 100);
				stripeCurrency = "usd";
			}

			if (!Number.isFinite(unitAmount) || unitAmount < 1) {
				return res.status(400).json({ error: "Invalid product data" });
			}

			if (!localCurrency) {
				localCurrency = inputCurrency;
			}
			localAmountTotal += baseAmount * quantity;

			line_items.push({
				price_data: {
					currency: stripeCurrency,
					product_data: {
						name,
						images: product.image ? [product.image] : [],
					},
					unit_amount: unitAmount,
				},
				quantity,
			});
		}

		const baseUrl = `${req.protocol}://${req.get("host")}`;
		// include session_id to guarantee DB persistence on return even if webhook delivery fails
		const success_url = `${baseUrl}/cart/success?session_id={CHECKOUT_SESSION_ID}`;
		const cancel_url = `${baseUrl}/cart/cancel`;

		try {
			const primaryProduct = products[0] || {};
			const listingId = String(primaryProduct.listingId || "").trim();
			if (!listingId) {
				return res.status(400).json({ error: "Listing id is required" });
			}

			const listing = await Listing.findById(listingId).select("owner title location country");
			if (!listing) {
				return res.status(404).json({ error: "Listing not found" });
			}

			if (listing.owner && listing.owner.equals(req.user._id)) {
				return res.status(403).json({ error: "Owners cannot pay for their own listing" });
			}

			const session = await stripe.checkout.sessions.create({
				customer_email: req.user?.email || undefined,
				payment_method_types: [
					"card",
					"affirm",
					"afterpay_clearpay",
					"wechat_pay",
					"cashapp",
				],
				payment_method_options: {
					wechat_pay: { client: "web" },
				},
				line_items,
				mode: "payment",
				success_url,
				cancel_url,
				metadata: {
					userId: String(req.user?._id || ""),
					customerEmail: String(req.user?.email || ""),
					listingId,
					listingTitle: String(primaryProduct.listingTitle || listing.title || primaryProduct.name || ""),
					listingLocation: String(primaryProduct.listingLocation || listing.location || ""),
					listingCountry: String(primaryProduct.listingCountry || listing.country || ""),
					days: String(primaryProduct.quantity || 1),
					localAmount: String(Number(localAmountTotal.toFixed(2))),
					localCurrency: String((localCurrency || "usd")).toUpperCase(),
				},
			});

			return res.json({ id: session.id, url: session.url });
		} catch (error) {
			return res.status(500).json({ error: error.message || "Stripe error" });
		}
	})
);

router.get(
	"/success",
	isLoggedIn,
	wrapAsync(async (req, res) => {
		const sessionId = String(req.query.session_id || "").trim();

		if (sessionId) {
			const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.WANDERLUST_STRIPE_SECRET_KEY;
			if (stripeSecret) {
				const stripe = require("stripe")(stripeSecret);
				const session = await stripe.checkout.sessions.retrieve(sessionId);

				if (session?.payment_status === "paid") {
					const paymentRecord = await PaymentRecord.findOneAndUpdate(
						{ sessionId: session.id },
						{ $set: {
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
							status: "paid",
							customerEmail: req.user?.email || session.metadata?.customerEmail || null,
							customerName: session.customer_details?.name || null,
							userId: session.metadata?.userId || String(req.user._id),
							listingId: session.metadata?.listingId || null,
							listingTitle: session.metadata?.listingTitle || null,
							listingLocation: session.metadata?.listingLocation || null,
							listingCountry: session.metadata?.listingCountry || null,
							bookingDays: session.metadata?.days ? Number(session.metadata.days) : 1,
							reservationDate: session.created ? new Date(session.created * 1000) : new Date(),
							paymentMethodTypes: Array.isArray(session.payment_method_types)
								? session.payment_method_types
								: [],
							sessionCreatedAt: session.created ? new Date(session.created * 1000) : null,
							lastEventType: "checkout.session.completed",
						}},
						{ upsert: true, new: true }
					);

					// attempt to send booking confirmation immediately on redirect
					try {
						await sendBookingEmail(paymentRecord);
					} catch (emailErr) {
						console.error("Error sending booking email on success redirect:", emailErr);
					}
				}
			}
		}

		return res.render("cart/success");
	})
);

router.get("/cancel", isLoggedIn, (req, res) => {
	return res.render("cart/cancel");
});

router.get("/failed", isLoggedIn, (req, res) => {
	return res.render("cart/failed");
});

router.get(
	"/booked-listings",
	isLoggedIn,
	(req, res) => res.redirect("/listings/reservations")
);

router.get("/:id", isLoggedIn, wrapAsync(cartController.renderCartPage));

module.exports = router;