const axios = require("axios");
const ExchangeRate = require("../models/exchangeRate.js");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toDateString = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};

const fetchLatestRates = async () => {
  const apiKey = process.env.EXCHANGE_RATE_OPEN_EXCHANGE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing exchange rate API key");
  }

  const url = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}`;
  const response = await axios.get(url, { timeout: 10000 });
  const data = response?.data;
  const rates = data?.rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("Invalid exchange rate data");
  }

  return {
    base: String(data?.base || "USD").toUpperCase(),
    rates,
    fetchedAt: new Date(data?.timestamp ? data.timestamp * 1000 : Date.now()),
  };
};

const refreshDailyRates = async () => {
  const latest = await fetchLatestRates();
  const fetchedDate = toDateString(latest.fetchedAt);
  await ExchangeRate.findOneAndUpdate(
    { base: latest.base, fetchedDate },
    {
      base: latest.base,
      rates: latest.rates,
      fetchedAt: latest.fetchedAt,
      fetchedDate,
    },
    { upsert: true, new: true }
  );
};

const getUsdRateFor = async (currency) => {
  const symbol = String(currency || "").toUpperCase();
  if (!symbol) {
    throw new Error("Missing currency symbol");
  }

  if (symbol === "USD") {
    return 1;
  }

  const today = toDateString(Date.now());
  let record = await ExchangeRate.findOne({ base: "USD", fetchedDate: today });
  const isStale = !record;

  if (isStale) {
    await refreshDailyRates();
    record = await ExchangeRate.findOne({ base: "USD", fetchedDate: today });
  }

  if (!record) {
    record = await ExchangeRate.findOne({ base: "USD" }).sort({ fetchedAt: -1 });
  }

  const rate = Number(record?.rates?.get?.(symbol) ?? record?.rates?.[symbol]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Missing exchange rate for ${symbol}`);
  }

  return rate;
};

const getUsdRatesFor = async (currencies) => {
  const symbols = (Array.isArray(currencies) ? currencies : [])
    .map((value) => String(value || "").toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    throw new Error("Missing currency symbols");
  }

  const today = toDateString(Date.now());
  let record = await ExchangeRate.findOne({ base: "USD", fetchedDate: today });
  const isStale = !record;

  if (isStale) {
    await refreshDailyRates();
    record = await ExchangeRate.findOne({ base: "USD", fetchedDate: today });
  }

  if (!record) {
    record = await ExchangeRate.findOne({ base: "USD" }).sort({ fetchedAt: -1 });
  }

  const rates = {};
  for (const symbol of symbols) {
    if (symbol === "USD") {
      rates[symbol] = 1;
      continue;
    }

    const rate = Number(record?.rates?.get?.(symbol) ?? record?.rates?.[symbol]);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Missing exchange rate for ${symbol}`);
    }
    rates[symbol] = rate;
  }

  return {
    base: record?.base || "USD",
    fetchedDate: record?.fetchedDate,
    rates,
  };
};

const startDailyExchangeRateRefresh = () => {
  refreshDailyRates().catch((error) => {
    console.log("Exchange rate refresh failed", error.message || error);
  });

  setInterval(() => {
    refreshDailyRates().catch((error) => {
      console.log("Exchange rate refresh failed", error.message || error);
    });
  }, ONE_DAY_MS);
};

module.exports = {
  getUsdRateFor,
  getUsdRatesFor,
  refreshDailyRates,
  startDailyExchangeRateRefresh,
};
