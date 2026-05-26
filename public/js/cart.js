import { loadStripe } from "https://cdn.jsdelivr.net/npm/@stripe/stripe-js/+esm";

(() => {
  const cartPage = document.querySelector(".cart-page");
  if (!cartPage) return;

  const cartListingData = document.getElementById("cart-listing-data");
  const cartListing = cartListingData ? JSON.parse(cartListingData.textContent || "{}") : {};
  const bookingRangesData = document.getElementById("cart-booking-ranges");
  const bookingRanges = bookingRangesData
    ? JSON.parse(bookingRangesData.textContent || "[]")
    : [];
  const cartConfigData = document.getElementById("cart-config-data");
  const cartConfig = cartConfigData ? JSON.parse(cartConfigData.textContent || "{}") : {};
  // console.log("[cart] item information", cartListing);

  const row = cartPage.querySelector(".cart-item-row");
  const dayPrice = Number(row?.dataset.dayPrice || 0);
  const dayValue = cartPage.querySelector("[data-days-value]");
  const dateInput = cartPage.querySelector("#booking-range");
  const dateError = cartPage.querySelector("[data-date-error]");
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
  const gstRate = 0.18;
  const isGstEnabled = () => localStorage.getItem("gstEnabled") === "true";
  let currentTotal = dayPrice;
  let stripePromise;
  let usdRateForBdt = null;
  let usdRateForLocal = null;
  let localCurrency = null;
  let localCurrencyLabel = null;
  let bookingStart = null;
  let bookingEnd = null;

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

  const toUtcDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const getDaysBetween = (start, end) => {
    if (!start || !end) return 1;
    const diff = Math.round((toUtcDay(end) - toUtcDay(start)) / (24 * 60 * 60 * 1000));
    return diff + 1;
  };

  const toLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
      // Exchange rate fetch failed during cart render; silently ignore in production
    }
  };

  const render = (days, hasRange) => {
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
    payButton.disabled = !hasRange;
    payButton.setAttribute("aria-disabled", String(!hasRange));

    if (usdRateForBdt) {
      const usdTotal = total / usdRateForBdt;
      const localTotal = usdRateForLocal ? usdTotal * usdRateForLocal : 0;
      updateRateDisplay(usdTotal, localTotal);
    }

  };

  let days = 1;
  fetchRates().finally(() => render(days, false));

  if (window.flatpickr && dateInput) {
    dateInput.setAttribute("autocomplete", "off");
    dateInput.value = "";
    const toDayKey = (date) =>
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

    const disabledRanges = bookingRanges
      .map((range) => ({ from: range.start, to: range.end }))
      .filter((range) => range.from && range.to);

    const parseDateOnly = (value) => {
      const parts = String(value || "").split("-").map((part) => Number(part));
      if (parts.length !== 3) return null;
      const [year, month, day] = parts;
      if (!year || !month || !day) return null;
      return new Date(year, month - 1, day);
    };

    const disabledRangeKeys = disabledRanges
      .map((range) => {
        const from = parseDateOnly(range.from);
        const to = parseDateOnly(range.to);
        if (!from || !to) return null;
        return { from: toDayKey(from), to: toDayKey(to) };
      })
      .filter(Boolean);

    const isBookedDate = (date) => {
      const key = toDayKey(date);
      return disabledRangeKeys.some((range) => key >= range.from && key <= range.to);
    };

    const rangeOverlapsDisabled = (start, end) => {
      const startKey = toDayKey(start);
      const endKey = toDayKey(end);
      return disabledRangeKeys.some((range) => startKey <= range.to && endKey >= range.from);
    };

    const setFilledState = (instance, isFilled) => {
      const targets = [instance?.input, instance?.altInput].filter(Boolean);
      targets.forEach((el) => el.classList.toggle("is-filled", isFilled));
    };

    window.flatpickr(dateInput, {
      mode: "range",
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "M j",
      rangeSeparator: " - ",
      altInputClass: "form-control cart-date-input cart-date-input--alt",
      showMonths: 2,
      minDate: "today",
      disable: [isBookedDate],
      defaultDate: null,
      onDayCreate: (dObj, dStr, fp, dayElem) => {
        const date = dayElem.dateObj;
        if (!date) return;
        const isBooked = isBookedDate(date);
        if (isBooked) {
          dayElem.classList.add("booked-day");
          dayElem.classList.add("flatpickr-disabled", "notAllowed");
          dayElem.setAttribute("aria-disabled", "true");
        }
      },
      onReady: (selectedDates, dateStr, instance) => {
        instance.clear();
        if (instance.altInput) {
          instance.altInput.value = "";
        }
        setFilledState(instance, false);
      },
      onChange: (selectedDates, dateStr, instance) => {
        if (selectedDates.length === 2) {
          const nextStart = selectedDates[0];
          const nextEnd = selectedDates[1];
          const diffDays = getDaysBetween(nextStart, nextEnd);

          if (diffDays < 1) {
            bookingStart = null;
            bookingEnd = null;
            days = 1;
            if (dateError) {
              dateError.hidden = false;
            }
            render(days, false);
            return;
          }

          if (rangeOverlapsDisabled(nextStart, nextEnd)) {
            bookingStart = null;
            bookingEnd = null;
            days = 1;
            if (dateError) {
              dateError.textContent = "Selected dates are not available.";
              dateError.hidden = false;
            }
            instance.clear();
            setFilledState(instance, false);
            render(days, false);
            return;
          }

          bookingStart = nextStart;
          bookingEnd = nextEnd;
          days = diffDays;
          setFilledState(instance, true);
          if (dateError) {
            dateError.textContent = "Please select available dates.";
            dateError.hidden = true;
          }
          render(days, true);
          return;
        }

        bookingStart = null;
        bookingEnd = null;
        days = 1;
        setFilledState(instance, false);
        if (dateError) {
          dateError.textContent = "Please select available dates.";
          dateError.hidden = true;
        }
        render(days, false);
      },
      onValueUpdate: (selectedDates, dateStr, instance) => {
        if (instance.altInput && instance.altInput.value) {
          instance.altInput.value = instance.altInput.value.replace(" to ", " - ");
        }
      },
    });
  }

  window.addEventListener("gst-change", () => render(days, !!bookingStart && !!bookingEnd));
  window.addEventListener("storage", (event) => {
    if (event.key === "gstEnabled") {
      render(days, !!bookingStart && !!bookingEnd);
    }
  });

  window.makePayment = () => {
    (async () => {
      try {
        if (!bookingStart || !bookingEnd) {
          if (dateError) {
            dateError.hidden = false;
          }
          return;
        }

        if (!cartConfig.stripePublicKey) {
          // Stripe public key missing; abort payment initiation
          return;
        }

        if (!cartConfig.stripePublicKey.startsWith("pk_")) {
          // Invalid Stripe public key format; abort
          return;
        }

        if (!stripePromise) {
          stripePromise = loadStripe(cartConfig.stripePublicKey);
        }

        await stripePromise;

        const subtotal = dayPrice * days;
        const gstAmount = isGstEnabled() ? subtotal * gstRate : 0;
        const bookingStartDate = toLocalDateString(bookingStart);
        const bookingEndDate = toLocalDateString(bookingEnd);
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

        const body = {
          products,
          bookingStartDate,
          bookingEndDate,
        };

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
          // Checkout session creation failed; show user-friendly error
          if (dateError) {
            const message = payload && payload.error
              ? String(payload.error)
              : "Selected dates are not available.";
            dateError.textContent = message;
            dateError.hidden = false;
          }
          if (bookingStart && bookingEnd) {
            bookingStart = null;
            bookingEnd = null;
            days = 1;
            render(days, false);
          }
          return;
        }

        window.location.href = payload.url;
      } catch (error) {
        // Payment flow error; handled silently for now
      }
    })();
  };
})();