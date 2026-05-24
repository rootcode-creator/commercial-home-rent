(() => {
  const storageKey = "gstEnabled";
  const gstSwitch = document.getElementById("flexSwitchCheckDefault");

  const getGstState = () => localStorage.getItem(storageKey) === "true";

  const setGstState = (enabled) => {
    localStorage.setItem(storageKey, String(enabled));
    window.dispatchEvent(new CustomEvent("gst-change", { detail: { enabled } }));
  };

  const updateTaxLabels = (enabled) => {
    const taxInfo = document.getElementsByClassName("tax-info");
    for (const info of taxInfo) {
      info.style.display = enabled ? "inline" : "none";
    }
  };

  if (gstSwitch) {
    const enabled = getGstState();
    gstSwitch.checked = enabled;
    updateTaxLabels(enabled);

    gstSwitch.addEventListener("change", () => {
      setGstState(gstSwitch.checked);
      updateTaxLabels(gstSwitch.checked);
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    const enabled = event.newValue === "true";
    if (gstSwitch) {
      gstSwitch.checked = enabled;
      updateTaxLabels(enabled);
    }
    window.dispatchEvent(new CustomEvent("gst-change", { detail: { enabled } }));
  });
})();

