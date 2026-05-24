import { loadStripe } from "https://cdn.jsdelivr.net/npm/@stripe/stripe-js/+esm";

(() => {
  const cartPage = document.querySelector(".cart-page");
  if (!cartPage) return;

  const cartListingData = document.getElementById("cart-listing-data");
  const cartListing = cartListingData ? JSON.parse(cartListingData.textContent || "{}") : {};
  const cartConfigData = document.getElementById("cart-config-data");
  const cartConfig = cartConfigData ? JSON.parse(cartConfigData.textContent || "{}") : {};
  console.log("[cart] item information", cartListing);

  const row = cartPage.querySelector(".cart-item-row");
  const dayPrice = Number(row?.dataset.dayPrice || 0);
  const dayValue = cartPage.querySelector("[data-days-value]");
  const subtotalCell = cartPage.querySelector(".cart-subtotal-cell");
  const subtotalSummary = cartPage.querySelector("[data-summary-subtotal]");
  const gstSummary = cartPage.querySelector("[data-summary-gst]");
  const totalSummary = cartPage.querySelector("[data-summary-total]");
  const usdRow = cartPage.querySelector("[data-summary-usd-row]");
  const usdSummary = cartPage.querySelector("[data-summary-usd]");
  const localRow = cartPage.querySelector("[data-summary-local-row]");
  const localLabel = cartPage.querySelector("[data-summary-local-label]");
  const localSummary = cartPage.querySelector("[data-summary-local]");
  const rateRow = cartPage.querySelector("[data-summary-rate]");
  const rateValue = cartPage.querySelector("[data-summary-rate-value]");
  const payButton = cartPage.querySelector("[data-pay-button]");
  const decrementButton = cartPage.querySelector('[data-action="decrement"]');
  const incrementButton = cartPage.querySelector('[data-action="increment"]');
  const gstRate = 0.18;
  const isGstEnabled = () => localStorage.getItem("gstEnabled") === "true";
  let currentTotal = dayPrice;
  let stripePromise;
  let usdRateForBdt = null;
  let usdRateForLocal = null;
  let localCurrency = null;
  let localCurrencyLabel = null;

  const currency = (value) => `৳${Number(value).toLocaleString("en-BN")}`;
  const formatCurrency = (value, code) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);

  const getUserCurrency = () => {
    const resolved = new Intl.NumberFormat().resolvedOptions();
    return resolved.currency ? resolved.currency.toUpperCase() : null;
  };

  const getRegionName = (locale) => {
    const match = String(locale || "").split("-")[1];
    if (!match) return null;
    try {
      const display = new Intl.DisplayNames([locale], { type: "region" });
      return display.of(match.toUpperCase());
    } catch (error) {
      return null;
    }
  };

  const updateRateDisplay = (usdTotal, localTotal) => {
    if (usdRow && usdSummary && usdRateForBdt) {
      usdRow.hidden = false;
      usdSummary.textContent = formatCurrency(usdTotal, "USD");
    }

    if (localRow && localSummary && localLabel && localCurrency && usdRateForLocal) {
      if (localCurrency === "USD") {
        localRow.hidden = true;
      } else {
        localRow.hidden = false;
        localSummary.textContent = formatCurrency(localTotal, localCurrency);
        const label = localCurrencyLabel
          ? `Approx. Total (${localCurrencyLabel})`
          : `Approx. Total (${localCurrency})`;
        localLabel.textContent = label;
      }
    }

    if (rateRow && rateValue && usdRateForLocal) {
      if (localCurrency && localCurrency !== "USD") {
        rateRow.hidden = false;
        rateValue.textContent = `${usdRateForLocal.toFixed(4)} ${localCurrency}`;
      } else {
        rateRow.hidden = true;
      }
    }
  };

  const fetchRates = async () => {
    localCurrency = getUserCurrency() || "USD";
    localCurrencyLabel = getRegionName(new Intl.NumberFormat().resolvedOptions().locale);
    const symbols = ["BDT", localCurrency].join(",");

    try {
      const response = await fetch(`/cart/exchange-rates?symbols=${encodeURIComponent(symbols)}`);
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      usdRateForBdt = Number(payload?.rates?.BDT);
      usdRateForLocal = Number(payload?.rates?.[localCurrency]);
      if (!Number.isFinite(usdRateForLocal) || usdRateForLocal <= 0) {
        usdRateForLocal = null;
      }
      if (!Number.isFinite(usdRateForBdt) || usdRateForBdt <= 0) {
        usdRateForBdt = null;
      }
    } catch (error) {
      console.log("Exchange rate error", error);
    }
  };

  const render = (days) => {
    const safeDays = Math.max(1, days);
    const subtotal = dayPrice * safeDays;
    const gstAmount = isGstEnabled() ? subtotal * gstRate : 0;
    const total = subtotal + gstAmount;
    currentTotal = total;

    dayValue.textContent = safeDays;
    subtotalCell.textContent = currency(subtotal);
    subtotalSummary.textContent = currency(subtotal);
    gstSummary.textContent = currency(gstAmount);
    totalSummary.textContent = currency(total);
    payButton.textContent = `Pay ${currency(total)}`;

    if (usdRateForBdt) {
      const usdTotal = total / usdRateForBdt;
      const localTotal = usdRateForLocal ? usdTotal * usdRateForLocal : 0;
      updateRateDisplay(usdTotal, localTotal);
    }

    decrementButton.disabled = safeDays === 1;
  };

  let days = 1;
  fetchRates().finally(() => render(days));

  incrementButton.addEventListener("click", () => {
    days += 1;
    render(days);
  });

  decrementButton.addEventListener("click", () => {
    days = Math.max(1, days - 1);
    render(days);
  });

  window.addEventListener("gst-change", () => render(days));
  window.addEventListener("storage", (event) => {
    if (event.key === "gstEnabled") {
      render(days);
    }
  });

  window.makePayment = () => {
    (async () => {
      try {
        if (!cartConfig.stripePublicKey) {
          console.log("Stripe public key is missing");
          return;
        }

        if (!cartConfig.stripePublicKey.startsWith("pk_")) {
          console.log("Stripe public key must start with pk_");
          return;
        }

        if (!stripePromise) {
          stripePromise = loadStripe(cartConfig.stripePublicKey);
        }

        await stripePromise;

        const subtotal = dayPrice * days;
        const gstAmount = isGstEnabled() ? subtotal * gstRate : 0;
        const products = [
          {
            listingId: cartListing._id,
            listingTitle: cartListing.title,
            listingLocation: cartListing.location,
            listingCountry: cartListing.country,
            name: cartListing.title,
            image: cartListing.image?.url,
            price: dayPrice,
            quantity: days,
            currency: "bdt",
          },
        ];

        if (gstAmount > 0) {
          products.push({
            name: "GST (18%)",
            price: Number(gstAmount.toFixed(2)),
            quantity: 1,
            currency: "bdt",
          });
        }

        const body = { products };

        const headers = {
          "Content-Type": "application/json",
        };

        const response = await fetch(`${cartConfig.apiURL}/create-checkout-session`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : await response.text();
        if (!response.ok || !payload || typeof payload === "string" || !payload.url) {
          console.log("Checkout session error", payload);
          return;
        }

        window.location.href = payload.url;
      } catch (error) {
        console.log("Payment error", error);
      }
    })();
  };
})();