(() => {
  const root = document.documentElement;
  const current = document.querySelector("#currentVersion");
  const next = document.querySelector("#newVersion");
  const status = document.querySelector("#updateStatus");
  const button = document.querySelector("#updateButton");
  const close = document.querySelector("#appClose");

  function applySettings(s) {
    if (!s) return;
    const vars = {
      "--bg": s.background || "#0A1412",
      "--surface": s.surface || "#10201D",
      "--accent": s.accent || "#E3A857",
      "--text": s.text || "#f4f6f5",
      "--dim": s.textDim || "#aab6b2",
      "--border": s.border || "rgba(255,255,255,.10)"
    };
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
      document.body.style.setProperty(key, value);
    }
  }

  function setState(state) {
    if (!state) return;
    if (state.currentVersion) current.textContent = state.currentVersion;
    if (state.newVersion) next.textContent = state.newVersion;
    if (state.status) status.textContent = state.status;
    if (state.button) button.textContent = state.button;
    button.disabled = !!state.disabled;
  }

  button.addEventListener("click", () => window.murkyUpdate.start());
  close.addEventListener("click", () => window.murkyUpdate.closeApp());

  window.murkyUpdate.onInit((state) => {
    applySettings(state.settings);
    setState(state);
  });
  window.murkyUpdate.onSettings(applySettings);
  window.murkyUpdate.onState(setState);
  window.murkyUpdate.getSettings()
    .then((state) => {
      applySettings(state);
      setState(state);
    })
    .catch(() => {});
})();
