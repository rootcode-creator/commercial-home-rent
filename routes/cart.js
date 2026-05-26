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

		const bookingStartDateRaw = String(req.body?.bookingStartDate || "").trim();
		const bookingEndDateRaw = String(req.body?.bookingEndDate || "").trim();
		if (!bookingStartDateRaw || !bookingEndDateRaw) {
			return res.status(400).json({ error: "Booking date range is required" });
		}

		const parseDateOnly = (value) => {
			const parts = String(value).split("-").map((part) => Number(part));
			if (parts.length !== 3) return null;
			const [year, month, day] = parts;
			if (!year || !month || !day) return null;
			return new Date(Date.UTC(year, month - 1, day));
		};

		const bookingStartDate = parseDateOnly(bookingStartDateRaw);
		const bookingEndDate = parseDateOnly(bookingEndDateRaw);
		if (!bookingStartDate || !bookingEndDate || Number.isNaN(bookingStartDate.getTime()) || Number.isNaN(bookingEndDate.getTime())) {
			return res.status(400).json({ error: "Invalid booking dates" });
		}

		const toUtcDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
				const diffDays = Math.round((toUtcDay(bookingEndDate) - toUtcDay(bookingStartDate)) / (24 * 60 * 60 * 1000));
				// Client counts days inclusively (e.g., 2 Jun - 4 Jun -> 3 days).
				// Allow same-day booking (diffDays === 0) and treat bookingDays as diffDays + 1.
				if (diffDays < 0) {
					return res.status(400).json({ error: "Check-out must be the same or after check-in" });
				}
				const bookingDays = diffDays + 1;

		// Build a single total line item to avoid per-item rounding differences between
		// client-side display (local currency) and Stripe (charged in USD).
		let localAmountTotal = 0;
		let localCurrency = null;
		for (const product of products) {
			const name = String(product.name || "").trim();
			const baseAmount = Number(product.price || 0);
			const isPrimary = String(product.listingId || "") === String(products[0]?.listingId || "");
			const quantity = isPrimary ? bookingDays : Math.max(1, Number(product.quantity || 1));
			const inputCurrency = String(product.currency || "usd").toLowerCase();
			if (!name || !Number.isFinite(baseAmount) || baseAmount <= 0) {
				return res.status(400).json({ error: "Invalid product data" });
			}

			if (!localCurrency) {
				localCurrency = inputCurrency;
			}
			localAmountTotal += baseAmount * quantity;
		}

		// Convert the aggregated local total into a single USD amount for Stripe.
		const line_items = [];
		try {
			let stripeCurrency = "usd";
			let unitAmount = 0; // in cents
			if (!localCurrency || String(localCurrency).toUpperCase() === "USD") {
				unitAmount = Math.round(localAmountTotal * 100);
				stripeCurrency = "usd";
			} else {
				const usdRate = await getUsdRateFor(localCurrency);
				const usdTotal = localAmountTotal / usdRate;
				unitAmount = Math.round(usdTotal * 100);
				stripeCurrency = "usd";
			}

			if (!Number.isFinite(unitAmount) || unitAmount < 1) {
				return res.status(400).json({ error: "Invalid product data" });
			}

			line_items.push({
				price_data: {
					currency: stripeCurrency,
					product_data: {
						name: `Booking for ${String(products[0]?.listingTitle || products[0]?.name || "Items")}`,
						images: products[0]?.image ? [products[0].image] : [],
					},
					unit_amount: unitAmount,
				},
				quantity: 1,
			});
		} catch (err) {
			return res.status(500).json({ error: err.message || "Exchange rate error" });
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

			const bookingRecords = await PaymentRecord.find({
				status: "paid",
				paymentStatus: "paid",
				lastEventType: { $in: ["checkout.session.completed", "checkout.session.async_payment_succeeded"] },
				listingId,
			})
				.select("bookingStartDate bookingEndDate reservationDate bookingDays")
				.lean();

			const hasOverlap = bookingRecords.some((record) => {
				const existingStart = record.bookingStartDate || record.reservationDate;
				if (!existingStart) return false;
				const start = new Date(existingStart);
				if (Number.isNaN(start.getTime())) return false;

				let end = record.bookingEndDate ? new Date(record.bookingEndDate) : null;
				if (!end || Number.isNaN(end.getTime())) {
					const days = Math.max(1, Number(record.bookingDays) || 1);
					// bookingDays is inclusive (e.g., 2 Jun - 4 Jun -> 3 days)
					// reconstruct inclusive end date as start + (days - 1)
					const offsetDays = Math.max(0, days - 1);
					end = new Date(start.getTime() + offsetDays * 24 * 60 * 60 * 1000);
				}

				// Inclusive date ranges: overlap if ranges share any day
				return bookingStartDate <= end && bookingEndDate >= start;
			});

			if (hasOverlap) {
				return res.status(409).json({ error: "Selected dates are not available" });
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
					days: String(bookingDays),
					bookingStartDate: bookingStartDate.toISOString().slice(0, 10),
					bookingEndDate: bookingEndDate.toISOString().slice(0, 10),
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
							bookingStartDate: session.metadata?.bookingStartDate
								? new Date(session.metadata.bookingStartDate)
								: null,
							bookingEndDate: session.metadata?.bookingEndDate
								? new Date(session.metadata.bookingEndDate)
								: null,
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