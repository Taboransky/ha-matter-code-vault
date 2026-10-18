// Matter Code Vault sidebar panel. Plain web component, no build step.

const WS = "matter_code_vault/";

const TYPE_LABELS = {
  lamp: "Lamp",
  plug: "Plug",
  switch: "Switch / button",
  sensor: "Sensor",
  lock: "Lock",
  thermostat: "Thermostat",
  blind: "Blind / cover",
  fan: "Fan",
  air_purifier: "Air purifier",
  media: "Speaker / media",
  bridge: "Bridge / hub",
  other: "Other",
};

const TYPE_ICONS = {
  lamp: "mdi:lightbulb",
  plug: "mdi:power-socket-eu",
  switch: "mdi:light-switch",
  sensor: "mdi:motion-sensor",
  lock: "mdi:lock",
  thermostat: "mdi:thermostat",
  blind: "mdi:blinds",
  fan: "mdi:fan",
  air_purifier: "mdi:air-purifier",
  media: "mdi:speaker",
  bridge: "mdi:hub",
  other: "mdi:devices",
};

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

const formatManual = (d) =>
  d && d.length === 11
    ? `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`
    : d && d.length === 21
      ? `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7, 11)}-${d.slice(11, 16)}-${d.slice(16)}`
      : d || "";

const hex4 = (n) => "0x" + Number(n).toString(16).toUpperCase().padStart(4, "0");

// --- Vendor script loading -------------------------------------------------

const _scripts = {};
function loadScript(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!_scripts[url]) {
    _scripts[url] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => resolve(window[globalName]);
      s.onerror = () => reject(new Error(`Could not load ${url}`));
      document.head.appendChild(s);
    });
  }
  return _scripts[url];
}

// --- QR rendering ----------------------------------------------------------

function qrSvg(text) {
  const qr = window.qrcode(0, "M");
  // Matter payloads only use QR alphanumeric characters.
  qr.addData(text, /^[0-9A-Z $%*+\-./:]+$/.test(text) ? "Alphanumeric" : "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const m = 2; // quiet zone in modules
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    }
  }
  const size = n + 2 * m;
  // Always black on white so it stays scannable in dark mode.
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// --- QR decoding from a photo -----------------------------------------------

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Image is already decoded into memory.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

let _detector; // undefined = not checked yet, null = unavailable
async function getDetector() {
  if (_detector === undefined) {
    _detector = null;
    try {
      if ("BarcodeDetector" in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes("qr_code")) {
          _detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        }
      }
    } catch (e) {
      // Use jsQR.
    }
  }
  return _detector;
}

const _canvas = document.createElement("canvas");
const _ctx = _canvas.getContext("2d", { willReadFrequently: true });

// Decode a QR code from an <img> or <video>, trying each max dimension in turn.
// Returns the text of a Matter code if one is found, else of any QR code, else null.
async function decodeQrFromSource(source, width, height, staticUrl, sizes) {
  const det = await getDetector();
  if (det) {
    try {
      const codes = await det.detect(source);
      const matter = codes.find((c) => /^MT:/i.test(c.rawValue));
      if (matter) return matter.rawValue;
      if (codes.length) return codes[0].rawValue;
      // BarcodeDetector is reliable; skip jsQR on live frames.
      if (source instanceof HTMLVideoElement) return null;
    } catch (e) {
      // Fall through to jsQR.
    }
  }

  const jsQR = await loadScript(`${staticUrl}/lib/jsQR.min.js`, "jsQR");
  for (const maxDim of sizes) {
    const scale = Math.min(1, maxDim / Math.max(width, height));
    _canvas.width = Math.round(width * scale);
    _canvas.height = Math.round(height * scale);
    _ctx.drawImage(source, 0, 0, _canvas.width, _canvas.height);
    const data = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
    const res = jsQR(data.data, _canvas.width, _canvas.height, {
      inversionAttempts: "attemptBoth",
    });
    if (res && res.data) return res.data;
  }
  return null;
}

async function decodeQrFromFile(file, staticUrl) {
  const img = await loadImage(file);
  // Phone photos are huge; labels are small. Try a few sizes.
  return decodeQrFromSource(img, img.naturalWidth, img.naturalHeight, staticUrl, [
    1000, 1600, 700, 2400,
  ]);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// --- Panel -------------------------------------------------------------------

const STYLE = `
:host {
  display: block;
  min-height: 100vh;
  background: var(--primary-background-color);
  color: var(--primary-text-color);
  font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
  --radius: var(--ha-card-border-radius, 12px);
}
* { box-sizing: border-box; }
.toolbar {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: center; gap: 4px;
  height: var(--header-height, 56px); padding: 0 12px;
  background: var(--app-header-background-color, var(--primary-color));
  color: var(--app-header-text-color, #fff);
  border-bottom: var(--app-header-border-bottom, none);
}
.toolbar .title { font-size: 20px; flex: 1; margin-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.content { max-width: 1200px; margin: 0 auto; padding: 16px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
button {
  font: inherit; cursor: pointer; border-radius: 8px; border: none;
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px;
}
button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
button.secondary { background: var(--card-background-color); color: var(--primary-color); border: 1px solid var(--divider-color); }
button.danger { background: transparent; color: var(--error-color, #db4437); border: 1px solid var(--error-color, #db4437); }
button.text { background: transparent; color: var(--primary-color); padding: 6px 8px; }
button:disabled { opacity: .5; cursor: default; }
ha-icon { --mdc-icon-size: 20px; }
.filters { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
input, select, textarea {
  font: inherit; width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--divider-color); background: var(--card-background-color);
  color: var(--primary-text-color);
}
textarea { min-height: 70px; resize: vertical; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  padding: 6px 12px; border-radius: 16px; font-size: 14px;
  background: var(--card-background-color); color: var(--primary-text-color);
  border: 1px solid var(--divider-color);
}
.chip.active { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
.row { display: flex; gap: 8px; }
.row > * { flex: 1; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.card {
  background: var(--card-background-color); border-radius: var(--radius);
  box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.15));
  border: var(--ha-card-border-width, 0) solid var(--divider-color);
  padding: 12px; display: flex; gap: 12px; cursor: pointer; text-align: left;
  color: inherit;
}
.card .qrbox { width: 96px; height: 96px; flex: none; border-radius: 6px; overflow: hidden; }
.qr { width: 100%; height: 100%; display: block; }
.noqr {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--secondary-background-color); color: var(--secondary-text-color); font-size: 11px; text-align: center; gap: 4px;
}
.info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.name { font-weight: 500; font-size: 16px; display: flex; align-items: center; gap: 6px; }
.name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code { font-family: var(--code-font-family, monospace); font-size: 15px; letter-spacing: .5px; }
.muted { color: var(--secondary-text-color); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  align-self: flex-start; font-size: 12px; padding: 2px 8px; border-radius: 10px;
  background: rgba(var(--rgb-primary-color, 3,169,244), .15); color: var(--primary-color);
}
.empty { text-align: center; color: var(--secondary-text-color); padding: 48px 16px; }
.empty ha-icon { --mdc-icon-size: 48px; display: block; margin-bottom: 12px; }
.overlay {
  position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.dialog {
  background: var(--card-background-color); color: var(--primary-text-color);
  border-radius: var(--radius); width: 100%; max-width: 520px; max-height: 100%;
  overflow: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px;
}
.dialog h2 { margin: 0; font-size: 20px; font-weight: 500; }
.dialog .bigqr { width: min(260px, 70vw); margin: 0 auto; }
.dialog .bigcode { text-align: center; font-size: 22px; display: flex; justify-content: center; align-items: center; gap: 4px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--secondary-text-color); }
.dialog .buttons { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px; }
.dialog .buttons .spacer { flex: 1; }
.error { color: var(--error-color, #db4437); font-size: 14px; }
.hint { color: var(--secondary-text-color); font-size: 13px; }
.meta { font-size: 12px; color: var(--secondary-text-color); text-align: center; }
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 20;
  background: #323232; color: #fff; padding: 10px 16px; border-radius: 6px; font-size: 14px;
}
input[type=file] { display: none; }
.viewfinder { position: relative; background: #000; border-radius: 8px; overflow: hidden; aspect-ratio: 4 / 3; }
.viewfinder video { width: 100%; height: 100%; object-fit: cover; display: block; }
.viewfinder .frame {
  position: absolute; left: 50%; top: 50%; width: 60%; aspect-ratio: 1; transform: translate(-50%, -50%);
  border: 3px solid rgba(255,255,255,.85); border-radius: 12px; box-shadow: 0 0 0 9999px rgba(0,0,0,.35);
}
.error:empty { display: none; }
@media (max-width: 600px) {
  .content { padding: 12px; }
  .grid { grid-template-columns: 1fr; }
  .overlay { padding: 0; align-items: stretch; }
  .dialog { max-width: none; border-radius: 0; }
  .actions button { flex: 1; justify-content: center; padding: 12px 8px; }
}
`;

class MatterCodeVaultPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._entries = [];
    this._loaded = false;
    this._search = "";
    this._typeFilter = "";
    this._roomFilter = "";
    this._dialog = null; // {mode: 'new'|'edit'|'manual'|'busy', ...}
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init();
    const mb = this.shadowRoot.querySelector("ha-menu-button");
    if (mb) mb.hass = hass;
  }

  set narrow(narrow) {
    this._narrow = narrow;
    const mb = this.shadowRoot.querySelector("ha-menu-button");
    if (mb) mb.narrow = narrow;
  }

  set panel(panel) {
    this._panel = panel;
  }

  get _staticUrl() {
    return this._panel?.config?.static_url || "/matter_code_vault_static";
  }

  get _version() {
    return this._panel?.config?.version || "0";
  }

  async _init() {
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="toolbar">
        <ha-menu-button></ha-menu-button>
        <div class="title">Matter Codes</div>
      </div>
      <div class="content">
        <div class="actions">
          <button class="primary" data-act="camera"><ha-icon icon="mdi:camera"></ha-icon>Scan QR</button>
          <button class="secondary" data-act="upload"><ha-icon icon="mdi:image"></ha-icon>From image</button>
          <button class="secondary" data-act="manual"><ha-icon icon="mdi:numeric"></ha-icon>Type code</button>
        </div>
        <input type="file" id="camera" accept="image/*" capture="environment">
        <input type="file" id="upload" accept="image/*">
        <div class="filters">
          <input type="search" id="search" placeholder="Search name, room, brand, code…" autocomplete="off">
          <div class="chips" id="typechips"></div>
          <select id="room"></select>
        </div>
        <div id="list"></div>
      </div>
      <div id="dialog"></div>
      <div id="toast"></div>
    `;
    const root = this.shadowRoot;
    const mb = root.querySelector("ha-menu-button");
    mb.hass = this._hass;
    mb.narrow = this._narrow;

    root.querySelector(".actions").addEventListener("click", (ev) => {
      const act = ev.target.closest("button")?.dataset.act;
      if (act === "camera") this._scan();
      if (act === "upload") root.getElementById("upload").click();
      if (act === "manual") this._openDialog({ mode: "manual", code: "", error: "" });
    });
    for (const id of ["camera", "upload"]) {
      root.getElementById(id).addEventListener("change", (ev) => {
        const file = ev.target.files?.[0];
        ev.target.value = "";
        if (file) this._handlePhoto(file);
      });
    }
    root.getElementById("search").addEventListener("input", (ev) => {
      this._search = ev.target.value;
      this._renderList();
    });
    root.getElementById("typechips").addEventListener("click", (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip) return;
      this._typeFilter = chip.dataset.type === this._typeFilter ? "" : chip.dataset.type;
      this._renderFilters();
      this._renderList();
    });
    root.getElementById("room").addEventListener("change", (ev) => {
      this._roomFilter = ev.target.value;
      this._renderList();
    });
    root.getElementById("list").addEventListener("click", (ev) => {
      const card = ev.target.closest(".card");
      if (card) this._openEntry(card.dataset.id);
    });
    root.getElementById("dialog").addEventListener("click", (ev) => this._onDialogClick(ev));
    root.getElementById("dialog").addEventListener("submit", (ev) => {
      ev.preventDefault();
      this._onDialogSubmit();
    });
    this._keyHandler = (ev) => {
      if (ev.key === "Escape" && this._dialog) this._closeDialog();
    };
    window.addEventListener("keydown", this._keyHandler);

    try {
      await loadScript(`${this._staticUrl}/lib/qrcode.js?v=${this._version}`, "qrcode");
    } catch (e) {
      this._toast("Could not load the QR library");
    }
    await this._reload();
  }

  disconnectedCallback() {
    if (this._keyHandler) window.removeEventListener("keydown", this._keyHandler);
    this._stopNativeScan(false);
    this._stopCamera();
  }

  _ws(type, data = {}) {
    return this._hass.callWS({ type: WS + type, ...data });
  }

  async _reload() {
    try {
      const res = await this._ws("list");
      this._entries = res.entries;
      this._loaded = true;
    } catch (e) {
      this._toast(`Could not load codes: ${e.message || e.code}`);
    }
    this._renderFilters();
    this._renderList();
  }

  _toast(msg) {
    const el = this.shadowRoot.getElementById("toast");
    el.innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (el.innerHTML = ""), 3500);
  }

  _deviceName(id) {
    const d = id && this._hass.devices?.[id];
    return d ? d.name_by_user || d.name || "device" : null;
  }

  _rooms() {
    const set = new Set(this._entries.map((e) => e.room).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  _renderFilters() {
    const root = this.shadowRoot;
    const present = new Set(this._entries.map((e) => e.device_type));
    root.getElementById("typechips").innerHTML = Object.keys(TYPE_LABELS)
      .filter((t) => present.has(t))
      .map(
        (t) =>
          `<button class="chip ${t === this._typeFilter ? "active" : ""}" data-type="${t}">${esc(TYPE_LABELS[t])}</button>`
      )
      .join("");
    const rooms = this._rooms();
    const sel = root.getElementById("room");
    sel.style.display = rooms.length ? "" : "none";
    if (this._roomFilter && !rooms.includes(this._roomFilter)) this._roomFilter = "";
    sel.innerHTML =
      `<option value="">All rooms</option>` +
      rooms
        .map((r) => `<option value="${esc(r)}" ${r === this._roomFilter ? "selected" : ""}>${esc(r)}</option>`)
        .join("");
  }

  _filtered() {
    const q = this._search.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    return this._entries
      .filter((e) => !this._typeFilter || e.device_type === this._typeFilter)
      .filter((e) => !this._roomFilter || e.room === this._roomFilter)
      .filter((e) => {
        if (!q) return true;
        const hay = [e.name, e.room, e.vendor_name, e.product_name, e.notes, TYPE_LABELS[e.device_type]]
          .join(" ")
          .toLowerCase();
        return hay.includes(q) || (qDigits.length >= 3 && e.manual_code.includes(qDigits));
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  _renderList() {
    const list = this.shadowRoot.getElementById("list");
    if (!this._loaded) {
      list.innerHTML = `<div class="empty">Loading…</div>`;
      return;
    }
    if (!this._entries.length) {
      list.innerHTML = `<div class="empty"><ha-icon icon="mdi:qrcode-scan"></ha-icon>No codes yet.<br>Scan the QR code on a Matter device or its box to store it here.</div>`;
      return;
    }
    const items = this._filtered();
    if (!items.length) {
      list.innerHTML = `<div class="empty">No codes match your search.</div>`;
      return;
    }
    list.innerHTML = `<div class="grid">${items.map((e) => this._cardHtml(e)).join("")}</div>`;
  }

  _qrHtml(entry) {
    if (entry.qr_payload && window.qrcode) {
      try {
        return qrSvg(entry.qr_payload);
      } catch (e) {
        /* fall through */
      }
    }
    return `<div class="noqr"><ha-icon icon="mdi:numeric"></ha-icon>Code only</div>`;
  }

  _cardHtml(e) {
    const paired = this._deviceName(e.linked_device_id);
    const brand = [e.vendor_name, e.product_name && e.product_name !== e.name ? e.product_name : ""]
      .filter(Boolean)
      .join(" · ");
    return `
      <button class="card" data-id="${e.id}">
        <div class="qrbox">${this._qrHtml(e)}</div>
        <div class="info">
          <div class="name"><ha-icon icon="${TYPE_ICONS[e.device_type] || TYPE_ICONS.other}"></ha-icon><span>${esc(e.name || "Unnamed device")}</span></div>
          <div class="code">${esc(formatManual(e.manual_code))}</div>
          ${brand ? `<div class="muted">${esc(brand)}</div>` : ""}
          <div class="muted">${esc(TYPE_LABELS[e.device_type] || "Other")}${e.room ? " · " + esc(e.room) : ""}</div>
          ${paired ? `<div class="badge">Paired as ${esc(paired)}</div>` : ""}
        </div>
      </button>`;
  }

  // --- Add flows -----------------------------------------------------------

  // --- Scanning ----------------------------------------------------------------

  _scan() {
    const external = this._hass.auth?.external;
    if (external?.config?.hasBarCodeScanner && typeof external.receiveMessage === "function") {
      this._scanNative(external);
    } else if (window.isSecureContext && navigator.mediaDevices?.getUserMedia) {
      this._scanLive();
    } else {
      this._toast("Live scanning needs the Home Assistant app or HTTPS, so take a photo instead.");
      this.shadowRoot.getElementById("camera").click();
    }
  }

  // Native scanner of the Companion app (same one HA uses for Matter/Z-Wave).
  // The frontend allows only one command handler, so we wrap receiveMessage to
  // observe bar_code/* commands and always pass them on to the original, which
  // still sends the app its result reply.
  _scanNative(external) {
    this._stopNativeScan(false);
    const original = external.receiveMessage;
    const wrapper = (msg) => {
      try {
        if (msg?.type === "command" && msg.command?.startsWith("bar_code/")) {
          this._onNativeScan(msg);
        }
      } finally {
        original.call(external, msg);
      }
    };
    external.receiveMessage = wrapper;
    this._native = { external, original, wrapper };
    external.fireMessage({
      type: "bar_code/scan",
      payload: {
        title: "Scan Matter QR code",
        description: "Point the camera at the QR code on the device, box or manual.",
        alternative_option_label: "Type code instead",
      },
    });
  }

  _stopNativeScan(close) {
    const n = this._native;
    if (!n) return;
    this._native = null;
    // Only restore if nobody wrapped it after us.
    if (n.external.receiveMessage === n.wrapper) n.external.receiveMessage = n.original;
    if (close) n.external.fireMessage({ type: "bar_code/close" });
  }

  _onNativeScan(msg) {
    const n = this._native;
    if (!n) return;
    if (msg.command === "bar_code/scan_result") {
      const raw = (msg.payload?.rawValue || "").trim();
      if (/^MT:/i.test(raw)) {
        this._stopNativeScan(true);
        this._startNew(raw);
      } else {
        n.external.fireMessage({
          type: "bar_code/notify",
          payload: { message: "Not a Matter code. Look for the QR code next to the Matter logo." },
        });
      }
    } else if (msg.command === "bar_code/aborted") {
      this._stopNativeScan(false);
      if (msg.payload?.reason === "alternative_options") {
        this._openDialog({ mode: "manual", code: "", error: "" });
      }
    }
  }

  // In-page camera for browsers (needs HTTPS).
  async _scanLive() {
    this._openDialog({ mode: "camera", error: "" });
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      if (this._dialog?.mode !== "camera") return;
      this._closeDialog();
      this._toast("Camera not available, so take a photo instead.");
      this.shadowRoot.getElementById("camera").click();
      return;
    }
    if (this._dialog?.mode !== "camera") {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const video = this.shadowRoot.querySelector("#dialog video");
    video.srcObject = stream;
    const cam = { stream, video, running: true };
    this._camera = cam;
    try {
      await video.play();
    } catch (e) {
      // Autoplay of a muted inline video is allowed; ignore odd failures.
    }

    let notified = false;
    // About 6 decode attempts per second.
    const tick = async () => {
      if (!cam.running) return;
      if (video.readyState >= 2 && video.videoWidth) {
        try {
          const text = await decodeQrFromSource(
            video, video.videoWidth, video.videoHeight, this._staticUrl, [800]
          );
          if (text && cam.running) {
            if (/^MT:/i.test(text.trim())) {
              this._stopCamera();
              this._startNew(text.trim());
              return;
            }
            if (!notified) {
              notified = true;
              this._dialog.error = "That QR code is not a Matter code. Look for the one next to the Matter logo.";
              const err = this.shadowRoot.querySelector("#dialog .error");
              if (err) err.textContent = this._dialog.error;
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
      setTimeout(tick, 160);
    };
    tick();
  }

  _stopCamera() {
    const cam = this._camera;
    if (!cam) return;
    this._camera = null;
    cam.running = false;
    cam.stream.getTracks().forEach((t) => t.stop());
    cam.video.srcObject = null;
  }

  async _handlePhoto(file) {
    this._openDialog({ mode: "busy", text: "Reading QR code…" });
    let text = null;
    try {
      text = await decodeQrFromFile(file, this._staticUrl);
    } catch (e) {
      console.error(e);
    }
    if (!text) {
      this._openDialog({
        mode: "manual",
        code: "",
        error:
          "No QR code found in the photo. Try again closer, with less glare, or type the number code below.",
      });
      return;
    }
    if (!/^MT:/i.test(text.trim())) {
      this._openDialog({
        mode: "manual",
        code: "",
        error: `That QR code is not a Matter code (it contains "${text.slice(0, 60)}"). Look for the QR code with the Matter logo next to it.`,
      });
      return;
    }
    await this._startNew(text.trim());
  }

  async _startNew(code) {
    let res;
    try {
      res = await this._ws("decode", { code });
    } catch (e) {
      this._openDialog({ mode: "manual", code, error: e.message || "Invalid code" });
      return;
    }
    if (res.existing_id) {
      this._toast("This code is already stored");
      this._openEntry(res.existing_id);
      return;
    }
    const p = res.payload;
    const draft = {
      name: "",
      device_type: "other",
      room: "",
      notes: "",
      vendor_name: "",
      product_name: "",
      linked_device_id: null,
    };
    this._openDialog({ mode: "new", code, payload: p, draft, lookup: p.vendor_id != null ? "loading" : null });
    this._loadDevices();
    if (p.vendor_id != null && p.product_id != null) {
      try {
        const info = await this._ws("lookup", { vendor_id: p.vendor_id, product_id: p.product_id });
        if (this._dialog?.code !== code) return;
        this._syncDraft();
        const d = this._dialog.draft;
        if (info.found) {
          d.vendor_name ||= info.vendor_name;
          d.product_name ||= info.product_name;
          d.name ||= info.product_name;
          if (d.device_type === "other") d.device_type = info.device_type;
        }
        this._dialog.lookup = info.found ? "ok" : "notfound";
      } catch (e) {
        if (this._dialog?.code !== code) return;
        this._syncDraft();
        this._dialog.lookup = "failed";
      }
      this._renderDialog();
      this._loadDevices();
    }
  }

  _openEntry(id) {
    const entry = this._entries.find((e) => e.id === id);
    if (!entry) return;
    this._openDialog({
      mode: "edit",
      entry,
      draft: {
        name: entry.name,
        device_type: entry.device_type,
        room: entry.room,
        notes: entry.notes,
        vendor_name: entry.vendor_name,
        product_name: entry.product_name,
        linked_device_id: entry.linked_device_id,
      },
    });
    this._loadDevices();
  }

  async _loadDevices() {
    const dlg = this._dialog;
    if (!dlg || !dlg.draft) return;
    const args = dlg.entry
      ? { entry_id: dlg.entry.id }
      : {
          product_id: dlg.payload?.product_id ?? null,
          vendor_name: dlg.draft.vendor_name || "",
          product_name: dlg.draft.product_name || "",
        };
    try {
      const devices = await this._ws("matter_devices", args);
      if (this._dialog !== dlg) return;
      this._syncDraft();
      dlg.devices = devices;
      this._renderDialog();
    } catch (e) {
      /* linking is optional */
    }
  }

  // --- Dialog ----------------------------------------------------------------

  _openDialog(state) {
    if (state.mode !== "camera") this._stopCamera();
    this._dialog = state;
    this._renderDialog();
  }

  _closeDialog() {
    this._stopCamera();
    this._dialog = null;
    this._renderDialog();
  }

  // Copy form values into the draft before re-rendering.
  _syncDraft() {
    const form = this.shadowRoot.querySelector("#dialog form");
    const dlg = this._dialog;
    if (!form || !dlg) return;
    if (dlg.mode === "manual") {
      dlg.code = form.elements.code?.value ?? dlg.code;
      return;
    }
    if (!dlg.draft) return;
    for (const k of ["name", "device_type", "room", "notes", "vendor_name", "product_name"]) {
      if (form.elements[k]) dlg.draft[k] = form.elements[k].value;
    }
    if (form.elements.linked_device_id) {
      dlg.draft.linked_device_id = form.elements.linked_device_id.value || null;
    }
  }

  _renderDialog() {
    const host = this.shadowRoot.getElementById("dialog");
    const dlg = this._dialog;
    if (!dlg) {
      host.innerHTML = "";
      return;
    }
    let body = "";
    if (dlg.mode === "busy") {
      body = `<div class="dialog"><h2>${esc(dlg.text)}</h2></div>`;
    } else if (dlg.mode === "camera") {
      body = `
        <div class="dialog">
          <h2>Scan Matter QR code</h2>
          <div class="viewfinder"><video autoplay muted playsinline></video><div class="frame"></div></div>
          <div class="hint">Hold the QR code inside the square. It is read automatically.</div>
          <div class="error">${esc(dlg.error)}</div>
          <div class="buttons">
            <button type="button" class="text" data-act="manual">Type code instead</button>
            <span class="spacer"></span>
            <button type="button" class="secondary" data-act="close">Cancel</button>
          </div>
        </div>`;
    } else if (dlg.mode === "manual") {
      body = `
        <form class="dialog">
          <h2>Type pairing code</h2>
          ${dlg.error ? `<div class="error">${esc(dlg.error)}</div>` : ""}
          <label>11-digit Matter code (e.g. 1234-567-8901)
            <input name="code" inputmode="numeric" autocomplete="off" value="${esc(dlg.code)}" required>
          </label>
          <div class="hint">You can also paste the text of a Matter QR code (starts with MT:).</div>
          <div class="buttons">
            <button type="button" class="text" data-act="close">Cancel</button>
            <button type="submit" class="primary">Next</button>
          </div>
        </form>`;
    } else {
      body = this._entryDialogHtml(dlg);
    }
    host.innerHTML = `<div class="overlay" data-act="backdrop">${body}</div>`;
    if (dlg.mode === "manual") host.querySelector("input[name=code]").focus();
  }

  _entryDialogHtml(dlg) {
    const isNew = dlg.mode === "new";
    const src = isNew ? dlg.payload : dlg.entry;
    const d = dlg.draft;
    const qr = src.qr_payload && window.qrcode ? `<div class="bigqr">${qrSvg(src.qr_payload)}</div>` : "";
    const lookupMsg = {
      loading: "Looking up product in the Matter database…",
      ok: "Product details filled in from the Matter database.",
      notfound: "Product not found in the Matter database. Please fill in the details.",
      failed: "Could not reach the Matter database. Please fill in the details.",
    }[dlg.lookup];

    const typeOpts = Object.entries(TYPE_LABELS)
      .map(([k, v]) => `<option value="${k}" ${k === d.device_type ? "selected" : ""}>${esc(v)}</option>`)
      .join("");
    const areaNames = Object.values(this._hass.areas || {}).map((a) => a.name);
    const roomOpts = [...new Set([...areaNames, ...this._rooms()])]
      .sort()
      .map((r) => `<option value="${esc(r)}"></option>`)
      .join("");

    let deviceField = "";
    const devices = dlg.devices || [];
    if (devices.length || d.linked_device_id) {
      const opts = devices
        .map((dev) => {
          const label = `${dev.suggested ? "★ " : ""}${dev.name || dev.model}${dev.model && dev.name ? ` (${dev.manufacturer} ${dev.model})` : ""}${dev.linked ? " — already linked" : ""}`;
          return `<option value="${dev.id}" ${dev.id === d.linked_device_id ? "selected" : ""}>${esc(label)}</option>`;
        })
        .join("");
      deviceField = `
        <label>Paired Home Assistant device
          <select name="linked_device_id"><option value="">Not linked</option>${opts}</select>
        </label>
        ${devices.some((x) => x.suggested) ? `<div class="hint">★ = likely match (same product)</div>` : ""}`;
    }

    const ids =
      src.vendor_id != null
        ? `<div class="meta">Vendor ${hex4(src.vendor_id)} · Product ${hex4(src.product_id)}${src.discriminator != null ? ` · Discriminator ${src.discriminator}` : ""}</div>`
        : `<div class="meta">Stored from the number code only, so no QR code is shown.</div>`;

    return `
      <form class="dialog">
        <h2>${isNew ? "New Matter device" : esc(d.name || "Matter device")}</h2>
        ${qr}
        <div class="bigcode code">${esc(formatManual(src.manual_code))}
          <button type="button" class="text" data-act="copy" title="Copy code"><ha-icon icon="mdi:content-copy"></ha-icon></button>
        </div>
        ${ids}
        ${lookupMsg ? `<div class="hint">${esc(lookupMsg)}</div>` : ""}
        <label>Name<input name="name" value="${esc(d.name)}" placeholder="e.g. KAJPLATS bedroom ceiling" required></label>
        <div class="row">
          <label>Type<select name="device_type">${typeOpts}</select></label>
          <label>Room<input name="room" list="rooms" value="${esc(d.room)}" autocomplete="off"></label>
        </div>
        <datalist id="rooms">${roomOpts}</datalist>
        <div class="row">
          <label>Brand<input name="vendor_name" value="${esc(d.vendor_name)}"></label>
          <label>Product<input name="product_name" value="${esc(d.product_name)}"></label>
        </div>
        ${deviceField}
        <label>Notes<textarea name="notes" placeholder="Where it is, reset instructions…">${esc(d.notes)}</textarea></label>
        ${dlg.error ? `<div class="error">${esc(dlg.error)}</div>` : ""}
        <div class="buttons">
          ${isNew ? "" : `<button type="button" class="danger" data-act="delete">Delete</button>`}
          ${!isNew && d.linked_device_id ? `<button type="button" class="text" data-act="device">Open device</button>` : ""}
          <span class="spacer"></span>
          <button type="button" class="text" data-act="close">${isNew ? "Cancel" : "Close"}</button>
          <button type="submit" class="primary" ${dlg.saving ? "disabled" : ""}>Save</button>
        </div>
      </form>`;
  }

  async _onDialogClick(ev) {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    if (act === "backdrop" && ev.target.classList.contains("overlay")) {
      if (this._dialog?.mode !== "busy") this._closeDialog();
      return;
    }
    if (act === "close") this._closeDialog();
    if (act === "manual") this._openDialog({ mode: "manual", code: "", error: "" });
    if (act === "copy") {
      const src = this._dialog.entry || this._dialog.payload;
      this._toast((await copyText(src.manual_code)) ? "Code copied" : "Could not copy");
    }
    if (act === "device") {
      const id = this._dialog.draft.linked_device_id;
      this._closeDialog();
      history.pushState(null, "", `/config/devices/device/${id}`);
      window.dispatchEvent(new CustomEvent("location-changed"));
    }
    if (act === "delete") {
      const e = this._dialog.entry;
      if (!confirm(`Delete "${e.name || formatManual(e.manual_code)}"? The code cannot be recovered unless you have the label.`))
        return;
      try {
        await this._ws("delete", { entry_id: e.id });
        this._closeDialog();
        await this._reload();
        this._toast("Deleted");
      } catch (err) {
        this._toast(err.message || "Delete failed");
      }
    }
  }

  async _onDialogSubmit() {
    const dlg = this._dialog;
    if (!dlg) return;
    this._syncDraft();
    if (dlg.mode === "manual") {
      await this._startNew(dlg.code.trim());
      return;
    }
    const fields = { ...dlg.draft };
    fields.name = fields.name.trim();
    fields.room = fields.room.trim();
    dlg.saving = true;
    dlg.error = "";
    this._renderDialog();
    try {
      if (dlg.mode === "new") {
        await this._ws("add", { code: dlg.code, ...fields });
        this._toast("Saved");
      } else {
        await this._ws("update", { entry_id: dlg.entry.id, ...fields });
        this._toast("Updated");
      }
      this._closeDialog();
      await this._reload();
    } catch (err) {
      dlg.saving = false;
      dlg.error = err.message || "Save failed";
      this._renderDialog();
    }
  }
}

customElements.define("matter-code-vault-panel", MatterCodeVaultPanel);
