function getFriendlyDbErrorMessage(error) {
  const message = String(error?.message || "");

  if (/buffering timed out/i.test(message)) {
    return "We are having trouble reaching the database right now. Please try again in a moment.";
  }

  return null;
}

module.exports = { getFriendlyDbErrorMessage };