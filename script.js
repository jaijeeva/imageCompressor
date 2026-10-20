(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = {
    items: [],
    active: -1,
    preset: "visual",
    zoom: "fit",
    downloads: null,
    token: 0,
  };
  const els = {
    fileInput: $("fileInput"),
    drop: $("drop"),
    presets: $("presets"),
    format: $("format"),
    quality: $("quality"),
    qualityOut: $("qualityOut"),
    qualityHint: $("qualityHint"),
    maxw: $("maxw"),
    queue: $("queue"),
    queueCount: $("queueCount"),
    saveOne: $("saveOne"),
    saveAll: $("saveAll"),
    status: $("status"),
    sOrig: $("sOrig"),
    sNew: $("sNew"),
    sSave: $("sSave"),
    sSaveBox: $("sSaveBox"),
    sDim: $("sDim"),
    sFmt: $("sFmt"),
    formats: $("formats"),
    stage: $("stage"),
    frame: $("frame"),
    empty: $("empty"),
    imgAfter: $("imgAfter"),
    imgBefore: $("imgBefore"),
    split: $("split"),
    note: $("note"),
    zFit: $("zFit"),
    z100: $("z100"),
  };

  const fmtBytes = (n) =>
    n < 1024
      ? n + " B"
      : n < 1048576
        ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB"
        : (n / 1048576).toFixed(2) + " MB";
  const extFor = (type) =>
    type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  const nameFor = (type) =>
    type === "image/png"
      ? "PNG"
      : type === "image/jpeg"
        ? "JPG"
        : type === "image/webp"
          ? "WebP"
          : type === "image/gif"
            ? "GIF"
            : type === "image/bmp"
              ? "BMP"
              : "Image";
  const baseName = (name) => name.replace(/\.[^.]+$/, "");

  // ---------- encoding ----------
  function settings() {
    const type = els.format.value;
    let q = Number(els.quality.value) / 100;
    return { type, quality: q, maxw: Number(els.maxw.value) };
  }
  function supportsType(type) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    return c.toDataURL(type).indexOf("data:" + type) === 0;
  }
  async function encode(item) {
    const s = settings();
    let type = s.type;
    if (type === "same")
      type = /^image\/(jpeg|png|webp)$/.test(item.origType)
        ? item.origType
        : "image/png";
    if (!supportsType(type)) type = "image/jpeg";
    const bmp = item.bitmap;
    let w = bmp.width,
      h = bmp.height;
    if (s.maxw && w > s.maxw) {
      h = Math.round((h * s.maxw) / w);
      w = s.maxw;
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) =>
      c.toBlob(res, type, type === "image/png" ? undefined : s.quality),
    );
    return { blob, w, h, type };
  }

  // ---------- items ----------
  async function addFiles(files) {
    const list = Array.from(files).filter((f) => /^image\//.test(f.type));
    if (!list.length) {
      setStatus("Those files aren't images. Choose JPG, PNG or WebP files.");
      return;
    }
    if (state.items.length && state.items[0].sample) {
      revoke(state.items[0]);
      state.items = [];
    }
    for (const file of list) {
      try {
        const bitmap = await createImageBitmap(file);
        state.items.push({
          name: file.name,
          size: file.size,
          origType: file.type,
          file,
          bitmap,
          origUrl: URL.createObjectURL(file),
          out: null,
          outUrl: null,
          busy: true,
        });
      } catch (e) {
        setStatus(
          "Couldn't read " +
            file.name +
            ". It may be damaged or an unsupported format.",
        );
      }
    }
    els.note.hidden = true;
    if (state.active < 0 || state.active >= state.items.length)
      state.active = 0;
    renderQueue();
    await processAll();
    select(state.active);
  }
  function revoke(it) {
    if (it.origUrl) URL.revokeObjectURL(it.origUrl);
    if (it.outUrl) URL.revokeObjectURL(it.outUrl);
  }

  async function processAll() {
    const token = ++state.token;
    for (const it of state.items) {
      it.busy = true;
    }
    renderQueue();
    for (let i = 0; i < state.items.length; i++) {
      const it = state.items[i];
      const out = await encode(it);
      if (token !== state.token) return;
      if (it.outUrl) URL.revokeObjectURL(it.outUrl);
      it.out = out;
      it.outUrl = URL.createObjectURL(out.blob);
      it.busy = false;
      renderQueue();
      if (i === state.active) showActive();
    }
    updateButtons();
  }

  // ---------- rendering ----------
  function renderQueue() {
    els.queue.textContent = "";
    state.items.forEach((it, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qitem" + (i === state.active ? " is-active" : "");
      b.setAttribute("aria-current", i === state.active ? "true" : "false");
      const img = document.createElement("img");
      img.src = it.origUrl;
      img.alt = "";
      const mid = document.createElement("div");
      mid.style.minWidth = "0";
      const nm = document.createElement("div");
      nm.className = "qname";
      nm.textContent = it.name;
      const mt = document.createElement("div");
      mt.className = "qmeta";
      mt.textContent = it.out
        ? fmtBytes(it.size) + " → " + fmtBytes(it.out.blob.size)
        : fmtBytes(it.size);
      mid.append(nm, mt);
      const pill = document.createElement("span");
      if (it.busy || !it.out) {
        pill.className = "pill pill--busy";
        pill.textContent = "…";
      } else {
        const pct = Math.round((1 - it.out.blob.size / it.size) * 100);
        pill.className = "pill " + (pct >= 0 ? "pill--good" : "pill--warn");
        pill.textContent = (pct >= 0 ? "−" : "+") + Math.abs(pct) + "%";
      }
      b.append(img, mid, pill);
      b.addEventListener("click", () => select(i));
      li.append(b);
      els.queue.append(li);
    });
    els.queueCount.textContent = state.items.length
      ? state.items.length + (state.items.length === 1 ? " image" : " images")
      : "";
  }
  function select(i) {
    state.active = i;
    renderQueue();
    showActive();
    updateButtons();
  }
  function showActive() {
    const it = state.items[state.active];
    if (!it) {
      els.frame.hidden = true;
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    els.frame.hidden = false;
    els.imgBefore.src = it.origUrl;
    if (it.outUrl) els.imgAfter.src = it.outUrl;
    applyZoom();
    els.sOrig.textContent = fmtBytes(it.size);
    if (it.out) {
      const saved = it.size - it.out.blob.size;
      const pct = Math.round((saved / it.size) * 100);
      els.sNew.textContent = fmtBytes(it.out.blob.size);
      els.sSave.textContent =
        (saved >= 0 ? "" : "+") +
        fmtBytes(Math.abs(saved)) +
        " (" +
        (saved >= 0 ? pct : -pct) +
        "%)";
      els.sSaveBox.className = "stat " + (saved >= 0 ? "is-good" : "is-warn");
      const resized = it.out.w !== it.bitmap.width;
      els.sDim.textContent = resized
        ? it.bitmap.width + " → " + it.out.w + " px"
        : it.out.w + " × " + it.out.h;
      els.sFmt.textContent =
        nameFor(it.origType) === nameFor(it.out.type)
          ? nameFor(it.out.type)
          : nameFor(it.origType) + " → " + nameFor(it.out.type);
      if (saved < 0 && !it.sample) {
        els.note.hidden = false;
        els.note.className = "note is-warn";
        els.note.textContent =
          "The compressed file is bigger than your original, which was already well optimised. Keep the original, or lower the quality or width.";
      } else if (!it.sample) {
        els.note.hidden = true;
        els.note.className = "note";
      }
    } else {
      els.sNew.textContent = "…";
      els.sSave.textContent = "…";
      els.sDim.textContent = "…";
      els.sFmt.textContent = "…";
    }
  }
  function applyZoom() {
    const it = state.items[state.active];
    if (!it || !it.out) return;
    if (state.zoom === "100") {
      els.frame.style.width = it.out.w + "px";
      els.frame.style.maxWidth = "none";
    } else {
      els.frame.style.width = "100%";
      els.frame.style.maxWidth = it.out.w + "px";
    }
  }
  function updateButtons() {
    const it = state.items[state.active];
    const ready = !!(it && it.out && !it.busy);
    const all =
      state.items.length > 0 && state.items.every((x) => x.out && !x.busy);
    const can = !!state.downloads;
    els.saveOne.disabled = !(ready && can);
    els.saveAll.disabled = !(
      all &&
      can &&
      state.items.length > 1 &&
      window.JSZip
    );
    els.saveOne.hidden = els.saveAll.hidden = !can;
  }
  function setStatus(t) {
    els.status.textContent = t;
  }

  // ---------- presets & controls ----------
  function setPreset(p) {
    state.preset = p;
    els.presets
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.preset === p)),
      );
    if (p === "lossless") {
      els.format.value = "image/webp";
      els.quality.value = 100;
    }
    if (p === "visual") {
      if (els.format.value === "image/png") els.format.value = "image/webp";
      els.quality.value = 85;
    }
    if (p === "small") {
      if (els.format.value === "image/png") els.format.value = "image/webp";
      els.quality.value = 70;
    }
    syncQualityUi();
    reprocess();
  }
  function setFormat(f) {
    els.format.value = f;
    els.formats
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.format === f)),
      );
  }
  function syncQualityUi() {
    els.formats
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.format === els.format.value),
        ),
      );
    const png = els.format.value === "image/png";
    els.quality.disabled = png;
    els.qualityOut.textContent = png ? "lossless" : els.quality.value;
    const q = Number(els.quality.value);
    els.qualityHint.textContent = png
      ? "PNG keeps every pixel exactly, but files are usually much larger than WebP."
      : q >= 100 && els.format.value === "image/webp"
        ? "WebP at 100 is pixel-exact (lossless) in Chrome and Edge."
        : q >= 80
          ? "80–90 looks identical to the original on screen for most photos."
          : "Below 80 the file gets much smaller; zoom to 100% to check fine details like stones and chains.";
  }
  let t = null;
  function reprocess() {
    clearTimeout(t);
    t = setTimeout(() => {
      if (state.items.length) processAll().then(showActive);
    }, 180);
  }

  els.presets.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-preset]");
    if (b) setPreset(b.dataset.preset);
  });
  els.formats.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-format]");
    if (!b || b.disabled) return;
    setFormat(b.dataset.format);
    syncQualityUi();
    markCustom();
    reprocess();
  });
  els.quality.addEventListener("input", () => {
    syncQualityUi();
    markCustom();
    reprocess();
  });
  els.maxw.addEventListener("change", reprocess);
  function markCustom() {
    const q = Number(els.quality.value),
      f = els.format.value;
    const match =
      f === "image/webp" && q === 100
        ? "lossless"
        : q === 85 && f !== "image/png"
          ? "visual"
          : q === 70 && f !== "image/png"
            ? "small"
            : "";
    els.presets
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.preset === match)),
      );
  }

  els.fileInput.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.add("is-over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    els.drop.addEventListener(ev, () => els.drop.classList.remove("is-over")),
  );
  els.drop.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    if (
      e.target.closest &&
      !e.target.closest("#drop") &&
      e.dataTransfer &&
      e.dataTransfer.files.length
    )
      addFiles(e.dataTransfer.files);
  });
  document.addEventListener("paste", (e) => {
    const f = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (f.length) addFiles(f);
  });

  // ---------- comparison slider ----------
  function setSplit(pct) {
    pct = Math.max(0, Math.min(100, pct));
    els.frame.style.setProperty("--split", pct + "%");
    els.split.value = pct;
  }
  let dragging = false;
  function fromPointer(e) {
    const r = els.frame.getBoundingClientRect();
    setSplit(((e.clientX - r.left) / r.width) * 100);
  }
  els.frame.addEventListener("pointerdown", (e) => {
    dragging = true;
    els.frame.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  els.frame.addEventListener("pointermove", (e) => {
    if (dragging) fromPointer(e);
  });
  els.frame.addEventListener("pointerup", () => {
    dragging = false;
  });
  els.frame.addEventListener("pointercancel", () => {
    dragging = false;
  });
  els.split.addEventListener("input", () => setSplit(Number(els.split.value)));
  els.split.style.width = "100%";

  function setZoom(z) {
    state.zoom = z;
    els.zFit.setAttribute("aria-pressed", String(z === "fit"));
    els.z100.setAttribute("aria-pressed", String(z === "100"));
    applyZoom();
    if (z === "100") {
      const s = els.stage;
      requestAnimationFrame(() => {
        s.scrollLeft = (s.scrollWidth - s.clientWidth) / 2;
        s.scrollTop = (s.scrollHeight - s.clientHeight) / 2;
      });
    }
  }
  els.zFit.addEventListener("click", () => setZoom("fit"));
  els.z100.addEventListener("click", () => setZoom("100"));

  // ---------- saving ----------
  async function save(filename, data) {
    try {
      await state.downloads.save({ filename, data });
      setStatus("Saved " + filename + ".");
    } catch (err) {
      const code = err && err.code;
      if (code === "declined") setStatus("Save cancelled.");
      else if (code === "rate_limited")
        setStatus("A save prompt is already open. Finish it, then try again.");
      else if (code === "extension_not_enabled")
        setStatus(
          "ZIP downloads aren't available here. Save images one at a time.",
        );
      else setStatus("Couldn't save the file here.");
    }
  }
  els.saveOne.addEventListener("click", () => {
    const it = state.items[state.active];
    if (!it || !it.out) return;
    save(baseName(it.name) + "." + extFor(it.out.type), it.out.blob);
  });
  els.saveAll.addEventListener("click", async () => {
    if (!window.JSZip) return;
    const zip = new JSZip();
    const used = {};
    state.items.forEach((it) => {
      let n = baseName(it.name) + "." + extFor(it.out.type);
      if (used[n])
        n = baseName(it.name) + "-" + ++used[n] + "." + extFor(it.out.type);
      else used[n] = 1;
      zip.file(n, it.out.blob);
    });
    setStatus("Building zip…");
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE",
    });
    save("compressed-images.zip", blob);
  });

  // ---------- sample so the tool opens in a working state ----------
  async function makeSample() {
    const w = 1600,
      h = 1000,
      c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#5b1220");
    bg.addColorStop(1, "#c4733a");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = "rgba(255,255,255," + Math.random() * 0.05 + ")";
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const cx = w / 2,
      cy = h * 0.36,
      r = 330;
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * 0.15 + Math.PI * 0.7 * (i / 25);
      const x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r * 0.9;
      const bead = g.createRadialGradient(x - 8, y - 8, 2, x, y, 26);
      bead.addColorStop(0, "#fff6d6");
      bead.addColorStop(0.45, "#e7b54a");
      bead.addColorStop(1, "#6e4610");
      g.fillStyle = bead;
      g.beginPath();
      g.arc(x, y, 24, 0, Math.PI * 2);
      g.fill();
      if (i % 3 === 1) {
        const st = g.createRadialGradient(x - 3, y + 30, 1, x, y + 36, 14);
        st.addColorStop(0, "#ff9aa8");
        st.addColorStop(1, "#8a0f2a");
        g.fillStyle = st;
        g.beginPath();
        g.arc(x, y + 36, 13, 0, Math.PI * 2);
        g.fill();
      }
    }
    const pend = g.createRadialGradient(
      cx - 14,
      cy + r * 0.9 + 70,
      4,
      cx,
      cy + r * 0.9 + 80,
      60,
    );
    pend.addColorStop(0, "#9ff0c8");
    pend.addColorStop(0.5, "#127a52");
    pend.addColorStop(1, "#05301f");
    g.fillStyle = pend;
    g.beginPath();
    g.ellipse(cx, cy + r * 0.9 + 80, 46, 60, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.85)";
    g.font = "600 40px Sora, sans-serif";
    g.fillText("Sample photo", 60, h - 70);
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const bitmap = await createImageBitmap(blob);
    state.items = [
      {
        name: "sample-necklace.png",
        size: blob.size,
        origType: "image/png",
        bitmap,
        origUrl: URL.createObjectURL(blob),
        out: null,
        outUrl: null,
        busy: true,
        sample: true,
      },
    ];
    state.active = 0;
    renderQueue();
    await processAll();
    select(0);
  }

  // ---------- boot ----------
  syncQualityUi();
  setSplit(50);
  if (!supportsType("image/webp")) {
    const o = els.formats.querySelector('button[data-format="image/webp"]');
    o.disabled = true;
    o.title = "This browser can't create WebP files";
    setFormat("image/jpeg");
  }
  makeSample();
  updateButtons();
  (async () => {
    if (!(window.claude && window.claude.use)) {
      // Opened as a normal file in a browser: use a regular download link.
      state.downloads = {
        save: ({ filename, data }) => {
          const url = URL.createObjectURL(
            data instanceof Blob ? data : new Blob([data]),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          return Promise.resolve({ status: "saved" });
        },
      };
      updateButtons();
      return;
    }
    try {
      state.downloads = await window.claude.use("downloads");
    } catch (e) {
      state.downloads = null;
    }
    if (!state.downloads)
      setStatus("Saving files isn't available in this view.");
    updateButtons();
  })();
})();
