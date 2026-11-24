(() => {
  const box = document.getElementById("music"), btn = document.getElementById("musicBtn");
  if (!box || !btn) return;
  const ICON_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play preview-icon"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
  const ICON_PAUSE = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause preview-icon"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
  const VOLUME = 0.65;
  const tr = (k) => (window.murkyErrorText ? window.murkyErrorText(k) : k);

  let ac = null, gain = null, buffer = null, source = null, decoding = null, playing = false, busy = false, suspendTimer = 0;

  function paint() {
    btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    btn.setAttribute("aria-pressed", playing ? "true" : "false");
    const label = tr(playing ? "musicPause" : "musicPlay");
    btn.setAttribute("aria-label", label); btn.title = label;
  }
  window.murkyMusicLabels = paint;

  function decode() {
    if (!decoding) {
      decoding = (async () => {
        const data = String(window.MURKY_OFFLINE_MUSIC || "").split(",")[1] || "";
        const bin = atob(data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        buffer = await ac.decodeAudioData(bytes.buffer);
      })();
    }
    return decoding;
  }

  async function play() {
    if (!ac) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ac = new Ctx();
      gain = ac.createGain(); gain.gain.value = 0; gain.connect(ac.destination);
    }
    clearTimeout(suspendTimer);
    await decode();
    if (!source) {
      source = ac.createBufferSource();
      source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = buffer.duration;
      source.connect(gain); source.start(0);
    }
    await ac.resume();
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(VOLUME, t + 0.7);
    playing = true;
  }
  function pause() {
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + 0.25);
    playing = false;
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => { if (!playing && ac && ac.state === "running") ac.suspend().catch(() => {}); }, 300);
  }

  btn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try { if (playing) pause(); else await play(); } catch { playing = false; }
    busy = false;
    paint();
    btn.blur();
  });
  window.addEventListener("pagehide", () => { try { if (ac) ac.close(); } catch {} });
  paint();
})();
