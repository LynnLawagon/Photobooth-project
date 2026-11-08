// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM TEMPLATE ENGINE
// ═══════════════════════════════════════════════════════════════════════════
//
// Finds the photo spots in a user's photostrip image and puts the camera shots
// into them. Three ways a spot can be found:
//
//   "hole"        The spot is transparent (PNG with see-through windows).
//                 Photos go underneath the template.
//   "placeholder" The spot holds a sample picture, like the blue-sky-and-hills
//                 image Canva bakes into exported templates. Only those
//                 pixels are replaced, so stickers overlapping a frame stay.
//   "manual"      The user marked the spots by hand. Photos go on top.

const CustomTemplate = (function () {
    const MAX_SIDE = 2400;            // longest side of the working/export size
    const MAX_SLOTS = 8;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const ALPHA_HOLE = 128;

    const C_SKY = 1, C_GREEN = 2, C_WHITE = 3;

    function loadBlobImage(blob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("That file could not be read as an image."));
            };

            img.src = url;
        });
    }

    function loadSrc(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    // 4-connected components of every pixel where flag[i] is set.
    function components(flag, w, h) {
        const total = w * h;
        const label = new Int32Array(total);
        const stack = new Int32Array(total);
        const comps = [];

        for (let start = 0; start < total; start++) {
            if (!flag[start] || label[start]) continue;

            const id = comps.length + 1;
            let sp = 0;

            stack[sp++] = start;
            label[start] = id;

            let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;

            while (sp > 0) {
                const p = stack[--sp];
                const x = p % w;
                const y = (p - x) / w;

                area++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;

                if (x > 0 && flag[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[sp++] = p - 1; }
                if (x < w - 1 && flag[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[sp++] = p + 1; }
                if (y > 0 && flag[p - w] && !label[p - w]) { label[p - w] = id; stack[sp++] = p - w; }
                if (y < h - 1 && flag[p + w] && !label[p + w]) { label[p + w] = id; stack[sp++] = p + w; }
            }

            comps.push({ id, area, minX, minY, maxX, maxY });
        }

        return { label, comps };
    }

    // Square dilate (grow = true) or erode (grow = false) inside a box.
    function morph(mask, w, h, box, r, grow) {
        const x0 = Math.max(0, box.minX - r), x1 = Math.min(w - 1, box.maxX + r);
        const y0 = Math.max(0, box.minY - r), y1 = Math.min(h - 1, box.maxY + r);

        const tmp = new Uint8Array(mask.length);
        const out = mask.slice();

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                let hit = grow ? 0 : 1;

                for (let k = -r; k <= r; k++) {
                    const xx = x + k;
                    const v = xx < 0 || xx >= w ? (grow ? 0 : 1) : mask[y * w + xx];

                    if (grow && v) { hit = 1; break; }
                    if (!grow && !v) { hit = 0; break; }
                }

                tmp[y * w + x] = hit;
            }
        }

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                let hit = grow ? 0 : 1;

                for (let k = -r; k <= r; k++) {
                    const yy = y + k;
                    const v = yy < 0 || yy >= h ? (grow ? 0 : 1) : tmp[yy * w + x];

                    if (grow && v) { hit = 1; break; }
                    if (!grow && !v) { hit = 0; break; }
                }

                out[y * w + x] = hit;
            }
        }

        return out;
    }

    function findHoles(alphaFlag, w, h) {
        const { comps } = components(alphaFlag, w, h);
        const total = w * h;
        const found = [];

        comps.forEach((c) => {
            const bw = c.maxX - c.minX + 1;
            const bh = c.maxY - c.minY + 1;
            const fill = c.area / (bw * bh);

            if (c.area / total < 0.008) return;
            if (fill < 0.7) return;

            const touchesEdge =
                c.minX === 0 || c.minY === 0 || c.maxX === w - 1 || c.maxY === h - 1;

            if (touchesEdge && fill < 0.9) return;
            if (bw >= w * 0.98 && bh >= h * 0.98) return;

            const bleed = 2;

            found.push({
                x: Math.max(0, c.minX - bleed),
                y: Math.max(0, c.minY - bleed),
                w: Math.min(w, c.maxX + 1 + bleed) - Math.max(0, c.minX - bleed),
                h: Math.min(h, c.maxY + 1 + bleed) - Math.max(0, c.minY - bleed)
            });
        });

        return found;
    }

    // Looks for the sample picture (light blue sky + green hills) in each frame.
    function findPlaceholders(cls, w, h) {
        const total = w * h;
        const core = new Uint8Array(total);

        for (let i = 0; i < total; i++) {
            core[i] = cls[i] === C_SKY || cls[i] === C_GREEN ? 1 : 0;
        }

        const { label, comps } = components(core, w, h);

        const sky = new Int32Array(comps.length + 1);
        const green = new Int32Array(comps.length + 1);

        for (let i = 0; i < total; i++) {
            if (!label[i]) continue;
            if (cls[i] === C_SKY) sky[label[i]]++; else green[label[i]]++;
        }

        const keep = comps.filter((c) => {
            const bw = c.maxX - c.minX + 1;
            const bh = c.maxY - c.minY + 1;

            return (
                c.area / total >= 0.004 &&
                bw >= w * 0.08 && bh >= h * 0.04 &&
                c.area / (bw * bh) >= 0.5 &&
                sky[c.id] / c.area >= 0.15 &&
                green[c.id] / c.area >= 0.06
            );
        });

        if (!keep.length) return null;

        const mask = new Uint8Array(total);

        keep.forEach((c) => {
            for (let y = c.minY; y <= c.maxY; y++) {
                for (let x = c.minX; x <= c.maxX; x++) {
                    const i = y * w + x;
                    if (cls[i]) mask[i] = 1;   // sky, green, or neutral white (clouds)
                }
            }
        });

        // Close tiny specks (film grain, anti-aliasing) and cover the edge fringe.
        let closed = mask;

        keep.forEach((c) => {
            closed = morph(closed, w, h, c, 3, true);
            closed = morph(closed, w, h, c, 2, false);
        });

        const windows = keep.map((c) => ({
            x: c.minX,
            y: c.minY,
            w: c.maxX - c.minX + 1,
            h: c.maxY - c.minY + 1
        }));

        return { windows, mask: closed };
    }

    // Top to bottom, left to right within a row.
    function sortReadingOrder(boxes) {
        const sorted = boxes.slice().sort((a, b) => a.y - b.y);
        const rows = [];

        sorted.forEach((box) => {
            const cy = box.y + box.h / 2;
            const row = rows.find((r) => Math.abs(r.cy - cy) < r.h * 0.5);

            if (row) row.items.push(box);
            else rows.push({ cy, h: box.h, items: [box] });
        });

        return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
    }

    function maskToCanvas(mask, w, h) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        const data = ctx.createImageData(w, h);

        for (let i = 0; i < mask.length; i++) {
            if (mask[i]) {
                data.data[i * 4 + 3] = 255;
            }
        }

        ctx.putImageData(data, 0, 0);
        return canvas;
    }

    // Builds a template from an image file. If no photo spots can be found
    // automatically, `windows` comes back empty and kind is "manual", so the
    // caller can let the user mark the spots by hand.
    async function analyze(file) {
        if (!file) throw new Error("No file selected.");

        if (!/^image\/(png|webp|jpeg)$/i.test(file.type)) {
            throw new Error("Please upload a PNG, WebP, or JPG image.");
        }

        if (file.size > MAX_FILE_BYTES) {
            throw new Error("That file is too large (max 25 MB).");
        }

        const img = await loadBlobImage(file);

        const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const w = Math.round(img.width * k);
        const h = Math.round(img.height * k);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);

        const px = ctx.getImageData(0, 0, w, h).data;
        const total = w * h;

        const cls = new Uint8Array(total);
        const clear = new Uint8Array(total);
        let anyClear = false;

        for (let i = 0; i < total; i++) {
            const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];

            if (a < ALPHA_HOLE) {
                clear[i] = 1;
                anyClear = true;
                continue;
            }

            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);

            if (b >= r + 10 && b >= g && (r + g + b) / 3 > 150) {
                cls[i] = C_SKY;
            } else if (g >= r + 12 && g >= b + 40) {
                cls[i] = C_GREEN;
            } else if (mn >= 205 && mx - mn <= 14) {
                cls[i] = C_WHITE;
            }
        }

        const base = {
            blob: file,
            name: file.name || "template",
            img,
            width: w,
            height: h,
            kind: "manual",
            windows: [],
            mask: null
        };

        if (anyClear) {
            const holes = findHoles(clear, w, h);

            if (holes.length && holes.length <= MAX_SLOTS) {
                return { ...base, kind: "hole", windows: sortReadingOrder(holes) };
            }
        }

        const ph = findPlaceholders(cls, w, h);

        if (ph && ph.windows.length <= MAX_SLOTS) {
            return {
                ...base,
                kind: "placeholder",
                windows: sortReadingOrder(ph.windows),
                maskCanvas: maskToCanvas(ph.mask, w, h)
            };
        }

        return base;
    }

    // Template from an image plus hand-marked spots (in template pixels).
    async function fromManual(file, windows) {
        const base = await analyze(file).catch(() => null);

        if (!base) throw new Error("That file could not be read as an image.");

        return {
            blob: file,
            name: base.name,
            img: base.img,
            width: base.width,
            height: base.height,
            kind: "manual",
            windows: sortReadingOrder(windows),
            mask: null
        };
    }

    function drawCover(ctx, img, x, y, w, h) {
        const targetAspect = w / h;
        const srcAspect = img.width / img.height;

        let sx = 0, sy = 0, sw = img.width, sh = img.height;

        if (srcAspect > targetAspect) {
            sw = img.height * targetAspect;
            sx = (img.width - sw) / 2;
        } else {
            sh = img.width / targetAspect;
            sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }

    async function compose(imageDataArray, template) {
        const photos = await Promise.all(imageDataArray.map(loadSrc));

        const canvas = document.createElement("canvas");
        canvas.width = template.width;
        canvas.height = template.height;

        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const fillWindows = (target) => {
            template.windows.forEach((win, i) => {
                const photo = photos[i % photos.length];
                if (photo) drawCover(target, photo, win.x, win.y, win.w, win.h);
            });
        };

        if (template.kind === "hole") {
            // Photos underneath, template with see-through windows on top.
            fillWindows(ctx);
            ctx.drawImage(template.img, 0, 0, canvas.width, canvas.height);

        } else if (template.kind === "placeholder") {
            // Template first, then photos only where the sample picture was.
            ctx.drawImage(template.img, 0, 0, canvas.width, canvas.height);

            const layer = document.createElement("canvas");
            layer.width = canvas.width;
            layer.height = canvas.height;

            const lctx = layer.getContext("2d");

            fillWindows(lctx);
            lctx.globalCompositeOperation = "destination-in";
            lctx.drawImage(template.maskCanvas, 0, 0);

            ctx.drawImage(layer, 0, 0);

        } else {
            // Hand-marked rectangles: photos on top of the template.
            ctx.drawImage(template.img, 0, 0, canvas.width, canvas.height);
            fillWindows(ctx);
        }

        return canvas.toDataURL("image/png");
    }

    function paintChecker(ctx, w, h) {
        const tile = 8;

        for (let y = 0; y < h; y += tile) {
            for (let x = 0; x < w; x += tile) {
                ctx.fillStyle = ((x + y) / tile) % 2 === 0 ? "#ffffff" : "#d9d2c2";
                ctx.fillRect(x, y, tile, tile);
            }
        }
    }

    function paintSpots(ctx, windows, k, selectedIndex) {
        windows.forEach((win, i) => {
            const x = win.x * k, y = win.y * k, w = win.w * k, h = win.h * k;
            const r = Math.max(9, Math.min(w, h) * 0.16);

            ctx.fillStyle = "rgba(169, 121, 60, 0.30)";
            ctx.fillRect(x, y, w, h);

            ctx.strokeStyle = "#8a3a2e";
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
            ctx.fillStyle = "#8a3a2e";
            ctx.fill();

            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.round(r * 1.2)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(i + 1), x + w / 2, y + h / 2 + 1);
        });
    }

    // Template with numbered photo spots on a checkerboard.
    function renderPreview(template, canvas, maxSide) {
        const k = Math.min(1, maxSide / Math.max(template.width, template.height));

        canvas.width = Math.max(1, Math.round(template.width * k));
        canvas.height = Math.max(1, Math.round(template.height * k));

        const ctx = canvas.getContext("2d");

        paintChecker(ctx, canvas.width, canvas.height);
        ctx.drawImage(template.img, 0, 0, canvas.width, canvas.height);
        paintSpots(ctx, template.windows, k);
    }

    return {
        analyze,
        fromManual,
        compose,
        renderPreview,
        paintSpots,
        paintChecker,
        sortReadingOrder,
        MAX_SLOTS
    };
})();

// ═══════════════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

const video = document.getElementById("video");
const stripBtn = document.getElementById("strip-btn");
const gallery = document.getElementById("gallery");
const timerInput = document.getElementById("timer");
const cameraSelect = document.getElementById("camera-select");
const filterSelect = document.getElementById("filter-select");
const countdownOverlay = document.getElementById("countdown-overlay");
const countdownNumber = document.getElementById("countdown-number");
const flashOverlay = document.getElementById("flash-overlay");
const selectAllBtn = document.getElementById("select-all-btn");
const batchSaveBtn = document.getElementById("batch-save-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const sessionEmpty = document.getElementById("session-empty");
const previewModal = document.getElementById("image-preview-modal");
const previewImage = document.getElementById("preview-image");
const closePreviewBtn = document.getElementById("close-preview-btn");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomResetBtn = document.getElementById("zoom-reset-btn");
const appContainer = document.getElementById("app-container");

const classicOptions = document.getElementById("classic-options");
const classicBgPanel = document.getElementById("classic-bg-panel");
const customTemplatePanel = document.getElementById("custom-template-panel");
const modeButtons = classicOptions.querySelectorAll(".seg");
const swatchButtons = classicOptions.querySelectorAll(".swatch");
const bgColorInput = document.getElementById("bg-color");
const templateFileInput = document.getElementById("template-file");
const templateUploadBtn = document.getElementById("template-upload-btn");
const templateDrop = document.getElementById("template-drop");
const templateInfo = document.getElementById("template-info");
const templatePreview = document.getElementById("template-preview");
const templateName = document.getElementById("template-name");
const templateSlots = document.getElementById("template-slots");
const templateRemoveBtn = document.getElementById("template-remove-btn");
const templateAdjustBtn = document.getElementById("template-adjust-btn");
const spotEditor = document.getElementById("spot-editor");
const spotCanvas = document.getElementById("spot-canvas");
const spotMessage = document.getElementById("spot-message");
const spotCount = document.getElementById("spot-count");
const spotClearBtn = document.getElementById("spot-clear");
const spotCancelBtn = document.getElementById("spot-cancel");
const spotDoneBtn = document.getElementById("spot-done");
const templateError = document.getElementById("template-error");

let currentStream = null;
let isCapturing = false;
let previewZoom = 1;
let previewSource = null;

// Classic 4 has two styles: the classic strip (with a choosable background
// color) or the user's own uploaded template.
const DEFAULT_CLASSIC_BG = "#f6f0e3";

let classicMode = "classic";          // "classic" | "custom"
let classicBg = DEFAULT_CLASSIC_BG;
let customTemplate = null;            // result of CustomTemplate.analyze()

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATE_DB = "photobooth";
const TEMPLATE_STORE = "kv";
const TEMPLATE_KEY = "custom-template";

const STORAGE_KEYS = {
    settings: "photobooth:settings:v1",
    gallery: "photobooth:gallery:v1"
};

const MAX_STORED_STRIPS = 8;
const STORED_MAX_WIDTH = 720;
const STORED_JPEG_QUALITY = 0.85;

let isRestoringGallery = false;
let persistTimer = null;
let isPersisting = false;
let persistAgain = false;

function storageGet(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        return false;
    }
}

function saveSettings() {
    storageSet(STORAGE_KEYS.settings, {
        filter: filterSelect.value,
        timer: timerInput.value,
        camera: cameraSelect.value || "",
        classicMode,
        classicBg
    });
}

function loadSettings() {
    return storageGet(STORAGE_KEYS.settings) || {};
}

function restoreSettings() {
    const saved = loadSettings();

    if (
        saved.filter &&
        filterSelect.querySelector(`option[value="${saved.filter}"]`)
    ) {
        filterSelect.value = saved.filter;
    }

    if (saved.timer !== undefined && saved.timer !== "") {
        const timer = parseInt(saved.timer, 10);

        if (!Number.isNaN(timer)) {
            timerInput.value = Math.min(60, Math.max(0, timer));
        }
    }

    if (saved.classicMode === "classic" || saved.classicMode === "custom") {
        classicMode = saved.classicMode;
    }

    if (isHexColor(saved.classicBg)) {
        classicBg = saved.classicBg.toLowerCase();
    }
}

function compressForStorage(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();

        img.onload = () => {
            const scale = Math.min(1, STORED_MAX_WIDTH / img.width);

            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);

            const ctx = canvas.getContext("2d");

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            resolve(canvas.toDataURL("image/jpeg", STORED_JPEG_QUALITY));
        };

        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

function scheduleGalleryPersist() {
    if (isRestoringGallery) return;

    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistGallery, 300);
}

async function persistGallery() {
    if (isPersisting) {
        persistAgain = true;
        return;
    }

    isPersisting = true;

    try {
        const items = Array.from(
            gallery.querySelectorAll(".photo-item")
        ).slice(0, MAX_STORED_STRIPS);

        const entries = [];

        for (const item of items) {
            if (!item.imageData) continue;

            if (!item.storedData || item.storedSource !== item.imageData) {
                item.storedData = await compressForStorage(item.imageData);
                item.storedSource = item.imageData;
            }

            if (item.storedData) {
                entries.push({
                    data: item.storedData,
                    label: item.querySelector("img")?.alt || ""
                });
            }
        }

        while (
            entries.length &&
            !storageSet(STORAGE_KEYS.gallery, entries)
        ) {
            entries.pop();
        }

        if (!entries.length) {
            try {
                localStorage.removeItem(STORAGE_KEYS.gallery);
            } catch (error) {}
        }
    } finally {
        isPersisting = false;

        if (persistAgain) {
            persistAgain = false;
            scheduleGalleryPersist();
        }
    }
}

function restoreGallery() {
    const saved = storageGet(STORAGE_KEYS.gallery);

    if (!Array.isArray(saved) || !saved.length) return;

    isRestoringGallery = true;

    try {
        for (let i = saved.length - 1; i >= 0; i--) {
            const entry = saved[i];

            if (
                !entry ||
                typeof entry.data !== "string" ||
                !entry.data.startsWith("data:image/")
            ) {
                continue;
            }

            const item = addPhotoToGallery(
                entry.data,
                entry.label || "Saved strip"
            );

            item.storedData = entry.data;
            item.storedSource = entry.data;
        }
    } finally {
        isRestoringGallery = false;
    }
}

function imageExtension(dataUrl) {
    return typeof dataUrl === "string" &&
        dataUrl.startsWith("data:image/jpeg")
        ? "jpg"
        : "png";
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIP LAYOUTS
// ═══════════════════════════════════════════════════════════════════════════

const CLASSIC_LAYOUT = {
    shots: 4,
    cols: 1,
    rows: 4,
    label: "Classic 4"
};

// Camera preview aspect ratio for the classic strip.
const CLASSIC_ASPECT = 4 / 3;

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIC 4 OPTIONS: BACKGROUND COLOR + CUSTOM TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

// The uploaded template file is kept in IndexedDB so it survives a reload
// (it can be too big for localStorage).
function openTemplateDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error("IndexedDB unavailable"));
            return;
        }

        const request = indexedDB.open(TEMPLATE_DB, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(TEMPLATE_STORE);
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function templateDbRun(mode, action) {
    const db = await openTemplateDb();

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(TEMPLATE_STORE, mode);
            const request = action(tx.objectStore(TEMPLATE_STORE));

            tx.oncomplete = () => resolve(request?.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function saveTemplateFile(file, windows) {
    try {
        await templateDbRun("readwrite", (store) =>
            store.put({ file, windows: windows || null }, TEMPLATE_KEY)
        );
    } catch (error) {
        console.warn("Could not remember the template for next time.", error);
    }
}

async function clearTemplateFile() {
    try {
        await templateDbRun("readwrite", (store) =>
            store.delete(TEMPLATE_KEY)
        );
    } catch (error) {}
}

async function loadSavedTemplateFile() {
    try {
        const record = await templateDbRun("readonly", (store) =>
            store.get(TEMPLATE_KEY)
        );

        if (!record) return null;

        // Older versions stored the bare file.
        return record.file ? record : { file: record, windows: null };
    } catch (error) {
        return null;
    }
}

function showTemplateError(message) {
    templateError.textContent = message || "";
    templateError.classList.toggle("hidden", !message);
}

function usingCustomTemplate() {
    return classicMode === "custom" && !!customTemplate;
}

function getActiveShots() {
    return usingCustomTemplate()
        ? customTemplate.windows.length
        : CLASSIC_LAYOUT.shots;
}

function getActiveAspect() {
    if (usingCustomTemplate()) {
        const win = customTemplate.windows[0];
        return win.w / win.h;
    }

    return CLASSIC_ASPECT;
}

function updateTemplateInfo() {
    templateInfo.classList.toggle("hidden", !customTemplate);
    templateDrop.classList.toggle("hidden", !!customTemplate);

    if (!customTemplate) return;

    CustomTemplate.renderPreview(customTemplate, templatePreview, 180);

    const count = customTemplate.windows.length;

    templateName.textContent = customTemplate.name;
    templateName.title = customTemplate.name;
    templateSlots.textContent =
        `${count} photo spot${count !== 1 ? "s" : ""} found`;
}

function updateClassicPanel() {
    modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === classicMode);
    });

    classicBgPanel.classList.toggle("hidden", classicMode !== "classic");
    customTemplatePanel.classList.toggle("hidden", classicMode !== "custom");

    swatchButtons.forEach((btn) => {
        btn.classList.toggle(
            "active",
            btn.dataset.color.toLowerCase() === classicBg
        );
    });

    bgColorInput.value = classicBg;

    updateTemplateInfo();
    applyLayoutAspect();
}

function setClassicBg(color) {
    if (!isHexColor(color)) return;

    classicBg = color.toLowerCase();
    updateClassicPanel();
    saveSettings();
}

function setClassicMode(mode) {
    classicMode = mode;
    updateClassicPanel();
    saveSettings();
}

async function useTemplate(template) {
    customTemplate = template;

    await saveTemplateFile(
        template.blob,
        template.kind === "manual" ? template.windows : null
    );

    updateClassicPanel();
}

async function loadTemplateFile(file) {
    showTemplateError("");

    try {
        const analyzed = await CustomTemplate.analyze(file);

        if (analyzed.windows.length) {
            await useTemplate(analyzed);
            return true;
        }

        // Nothing detected: let the user mark the photo spots.
        openSpotEditor(
            analyzed,
            [],
            "We couldn't find the photo spots automatically. Draw a box over each place a photo should go."
        );

        return false;

    } catch (error) {
        showTemplateError(error.message || "Could not use that template.");
        return false;
    }
}

async function removeTemplate() {
    customTemplate = null;
    showTemplateError("");
    templateFileInput.value = "";

    await clearTemplateFile();
    updateClassicPanel();
}

async function restoreTemplate() {
    const record = await loadSavedTemplateFile();

    if (!record) return;

    try {
        customTemplate = record.windows && record.windows.length
            ? await CustomTemplate.fromManual(record.file, record.windows)
            : await CustomTemplate.analyze(record.file);

        if (!customTemplate.windows.length) {
            customTemplate = null;
            return;
        }

        updateClassicPanel();
    } catch (error) {
        await clearTemplateFile();
    }
}

// ── Manual photo-spot editor ──────────────────────────────────────────────

let editorBase = null;
let editorWindows = [];
let editorScale = 1;
let editorDrag = null;

function openSpotEditor(base, windows, message) {
    editorBase = base;
    editorWindows = windows.map((win) => ({ ...win }));
    editorScale = Math.min(1, 1100 / base.height, 760 / base.width);

    spotCanvas.width = Math.max(1, Math.round(base.width * editorScale));
    spotCanvas.height = Math.max(1, Math.round(base.height * editorScale));

    spotMessage.textContent = message || "";
    spotMessage.classList.toggle("hidden", !message);

    spotEditor.classList.remove("hidden");
    spotEditor.setAttribute("aria-hidden", "false");

    redrawSpotEditor();
}

function closeSpotEditor() {
    spotEditor.classList.add("hidden");
    spotEditor.setAttribute("aria-hidden", "true");

    editorBase = null;
    editorDrag = null;
}

function redrawSpotEditor() {
    if (!editorBase) return;

    const ctx = spotCanvas.getContext("2d");
    const w = spotCanvas.width;
    const h = spotCanvas.height;

    CustomTemplate.paintChecker(ctx, w, h);
    ctx.drawImage(editorBase.img, 0, 0, w, h);

    const ordered = CustomTemplate.sortReadingOrder(editorWindows);

    CustomTemplate.paintSpots(ctx, ordered, editorScale);

    if (editorDrag) {
        const r = dragRect(editorDrag);

        ctx.fillStyle = "rgba(169, 121, 60, 0.35)";
        ctx.fillRect(r.x * editorScale, r.y * editorScale, r.w * editorScale, r.h * editorScale);
        ctx.strokeStyle = "#8a3a2e";
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(r.x * editorScale, r.y * editorScale, r.w * editorScale, r.h * editorScale);
        ctx.setLineDash([]);
    }

    const count = editorWindows.length;

    spotCount.textContent = count
        ? `${count} photo spot${count !== 1 ? "s" : ""} marked (max ${CustomTemplate.MAX_SLOTS})`
        : "No photo spots marked yet.";
}

function dragRect(drag) {
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);

    return {
        x,
        y,
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0)
    };
}

function spotPoint(event) {
    const rect = spotCanvas.getBoundingClientRect();

    const px = (event.clientX - rect.left) * (spotCanvas.width / rect.width);
    const py = (event.clientY - rect.top) * (spotCanvas.height / rect.height);

    return {
        x: Math.max(0, Math.min(editorBase.width, px / editorScale)),
        y: Math.max(0, Math.min(editorBase.height, py / editorScale))
    };
}

spotCanvas.addEventListener("pointerdown", (event) => {
    if (!editorBase) return;

    event.preventDefault();
    spotCanvas.setPointerCapture(event.pointerId);

    const p = spotPoint(event);
    editorDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
});

spotCanvas.addEventListener("pointermove", (event) => {
    if (!editorDrag) return;

    const p = spotPoint(event);

    editorDrag.x1 = p.x;
    editorDrag.y1 = p.y;

    redrawSpotEditor();
});

spotCanvas.addEventListener("pointerup", (event) => {
    if (!editorDrag) return;

    const p = spotPoint(event);

    editorDrag.x1 = p.x;
    editorDrag.y1 = p.y;

    const r = dragRect(editorDrag);
    const minSize = 14 / editorScale;

    if (r.w < minSize && r.h < minSize) {
        // A tap: delete the spot under the pointer.
        const index = editorWindows.findIndex((win) =>
            p.x >= win.x && p.x <= win.x + win.w &&
            p.y >= win.y && p.y <= win.y + win.h
        );

        if (index >= 0) editorWindows.splice(index, 1);

    } else if (r.w >= minSize && r.h >= minSize) {
        if (editorWindows.length >= CustomTemplate.MAX_SLOTS) {
            alert(`You can mark up to ${CustomTemplate.MAX_SLOTS} photo spots.`);
        } else {
            editorWindows.push({
                x: Math.round(r.x),
                y: Math.round(r.y),
                w: Math.round(r.w),
                h: Math.round(r.h)
            });
        }
    }

    editorDrag = null;
    redrawSpotEditor();
});

spotCanvas.addEventListener("pointercancel", () => {
    editorDrag = null;
    redrawSpotEditor();
});

spotClearBtn.addEventListener("click", () => {
    editorWindows = [];
    redrawSpotEditor();
});

spotCancelBtn.addEventListener("click", () => {
    if (!customTemplate) {
        showTemplateError("No photo spots were set, so the template wasn't added.");
    }

    closeSpotEditor();
});

spotDoneBtn.addEventListener("click", async () => {
    if (!editorWindows.length) {
        alert("Draw at least one photo spot first.");
        return;
    }

    try {
        const template = await CustomTemplate.fromManual(
            editorBase.blob,
            editorWindows
        );

        closeSpotEditor();
        showTemplateError("");
        await useTemplate(template);

    } catch (error) {
        alert(error.message || "Could not use those spots.");
    }
});

templateAdjustBtn.addEventListener("click", () => {
    if (customTemplate) {
        openSpotEditor(customTemplate, customTemplate.windows, "");
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !spotEditor.classList.contains("hidden")) {
        spotCancelBtn.click();
    }
});

modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setClassicMode(btn.dataset.mode));
});

swatchButtons.forEach((btn) => {
    btn.addEventListener("click", () => setClassicBg(btn.dataset.color));
});

bgColorInput.addEventListener("input", () => setClassicBg(bgColorInput.value));

templateUploadBtn.addEventListener("click", () => templateFileInput.click());

templateFileInput.addEventListener("change", () => {
    const file = templateFileInput.files?.[0];

    if (file) loadTemplateFile(file);

    templateFileInput.value = "";
});

templateRemoveBtn.addEventListener("click", removeTemplate);

["dragenter", "dragover"].forEach((type) => {
    customTemplatePanel.addEventListener(type, (event) => {
        event.preventDefault();
        templateDrop.classList.add("dragover");
    });
});

["dragleave", "drop"].forEach((type) => {
    customTemplatePanel.addEventListener(type, (event) => {
        event.preventDefault();
        templateDrop.classList.remove("dragover");
    });
});

customTemplatePanel.addEventListener("drop", (event) => {
    if (isCapturing) return;

    const file = event.dataTransfer?.files?.[0];

    if (file) loadTemplateFile(file);
});

// ═══════════════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════════════

const FILTERS = {
    none: {
        css: ""
    },

    grayscale: {
        css: "grayscale(100%)"
    },

    sepia: {
        css: "sepia(100%)"
    },

    noir: {
        css: "grayscale(100%) contrast(140%) brightness(85%)",
        vignette: 0.45
    },

    vintage: {
        css: "sepia(55%) saturate(75%) contrast(90%) brightness(105%)",
        vignette: 0.3
    },

    vivid: {
        css: "saturate(165%) contrast(115%) brightness(105%)"
    },

    cool: {
        css: "saturate(115%) hue-rotate(15deg) brightness(105%)"
    },

    warm: {
        css: "saturate(120%) sepia(18%) brightness(108%)"
    },

    dreamy: {
        css: "contrast(85%) brightness(112%) saturate(80%) blur(0.5px)"
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA
// ═══════════════════════════════════════════════════════════════════════════

async function initCameras() {
    if (!navigator.mediaDevices?.getUserMedia) {
        console.error("Camera API not supported.");

        cameraSelect.innerHTML =
            `<option value="">Camera unsupported</option>`;

        alert("This browser does not support camera access.");
        return;
    }

    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
            video: true
        });

        tempStream.getTracks().forEach((track) => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();

        const cameras = devices.filter(
            (device) => device.kind === "videoinput"
        );

        cameraSelect.innerHTML = cameras.length
            ? cameras.map((camera, index) =>
                `<option value="${camera.deviceId}">${camera.label || `Camera ${index + 1}`}</option>`
            ).join("")
            : `<option value="">No camera found</option>`;

        if (!cameras.length) return;

        const savedCamera = loadSettings().camera;

        const startId = cameras.some(
            (camera) => camera.deviceId === savedCamera
        )
            ? savedCamera
            : cameras[0].deviceId;

        cameraSelect.value = startId;

        await startCamera(startId);
        saveSettings();

    } catch (error) {
        console.error("Camera initialization error:", error);

        cameraSelect.innerHTML =
            `<option value="">Camera unavailable</option>`;

        alert("Camera access denied or not available.");
    }
}

async function startCamera(deviceId) {
    if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
    }

    const constraints = {
        video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(
            constraints
        );

        video.srcObject = currentStream;
        await video.play();

    } catch (error) {
        console.error("Camera start error:", error);
        alert("Could not start the selected camera.");
    }
}

cameraSelect.addEventListener("change", () => {
    if (cameraSelect.value) {
        startCamera(cameraSelect.value);
    }

    saveSettings();
});

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO FILTERS
// ═══════════════════════════════════════════════════════════════════════════

function updateVideoFilter() {
    const filter = FILTERS[filterSelect.value] || FILTERS.none;
    video.style.filter = filter.css || "none";
}

filterSelect.addEventListener("change", () => {
    updateVideoFilter();
    saveSettings();
});

timerInput.addEventListener("change", saveSettings);

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW ASPECT RATIO
// ═══════════════════════════════════════════════════════════════════════════

function applyLayoutAspect() {
    const videoWrapper = document.querySelector(".video-wrapper");

    if (!videoWrapper) return;

    const aspect = getActiveAspect();

    videoWrapper.style.aspectRatio = String(aspect);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO AND VISUAL EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

function playShutterSound() {
    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return;

        const ctx = new AudioContextClass();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(800, ctx.currentTime);

        oscillator.frequency.exponentialRampToValueAtTime(
            100,
            ctx.currentTime + 0.08
        );

        gain.gain.setValueAtTime(0.3, ctx.currentTime);

        gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + 0.08
        );

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.08);

        oscillator.onended = () => ctx.close();

    } catch (error) {}
}

function triggerFlash() {
    if (!flashOverlay) return;

    flashOverlay.classList.add("flash-active");

    setTimeout(() => {
        flashOverlay.classList.remove("flash-active");
    }, 150);
}

function showCountdown(seconds) {
    return new Promise((resolve) => {
        if (seconds <= 0) {
            resolve();
            return;
        }

        countdownOverlay.classList.remove("hidden");

        let remaining = seconds;

        const tick = () => {
            countdownNumber.textContent = remaining;

            if (remaining <= 0) {
                countdownOverlay.classList.add("hidden");
                resolve();
                return;
            }

            remaining--;
            setTimeout(tick, 1000);
        };

        countdownNumber.textContent = remaining;
        setTimeout(tick, 1000);
    });
}

function setControlsDisabled(disabled) {
    stripBtn.disabled = disabled;
    timerInput.disabled = disabled;
    cameraSelect.disabled = disabled;
    filterSelect.disabled = disabled;

    classicOptions
        .querySelectorAll("button, input")
        .forEach((control) => {
            control.disabled = disabled;
        });

    isCapturing = disabled;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

function getCoverCropRect(srcWidth, srcHeight, targetAspect) {
    const srcAspect = srcWidth / srcHeight;

    let sx = 0;
    let sy = 0;
    let sw = srcWidth;
    let sh = srcHeight;

    if (srcAspect > targetAspect) {
        sw = srcHeight * targetAspect;
        sx = (srcWidth - sw) / 2;
    } else {
        sh = srcWidth / targetAspect;
        sy = (srcHeight - sh) / 2;
    }

    return { sx, sy, sw, sh };
}

function applyVignette(ctx, width, height, strength) {
    const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.25,
        width / 2,
        height / 2,
        Math.min(width, height) * 0.7
    );

    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

function drawDateStamp(ctx, canvasWidth, canvasHeight) {
    const now = new Date();

    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const text = `'${year} ${month} ${day}`;

    const fontSize = Math.max(
        12,
        Math.round(canvasWidth * 0.032)
    );

    ctx.save();

    ctx.font = `italic bold ${fontSize}px "Courier New", monospace`;
    ctx.fillStyle = "rgba(255, 140, 40, 0.85)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 2;

    ctx.fillText(
        text,
        canvasWidth - fontSize * 0.6,
        canvasHeight - fontSize * 0.6
    );

    ctx.restore();
}

function captureFrame() {
    if (!video.videoWidth || !video.videoHeight) {
        throw new Error("Camera not ready");
    }

    const targetAspect =
        getActiveAspect() ||
        (video.videoWidth / video.videoHeight);

    const { sx, sy, sw, sh } = getCoverCropRect(
        video.videoWidth,
        video.videoHeight,
        targetAspect
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.round(sw * 1.5);
    canvas.height = Math.round(sh * 1.5);

    const ctx = canvas.getContext("2d", {
        willReadFrequently: true
    });

    const filterInfo = FILTERS[filterSelect.value] || FILTERS.none;

    ctx.save();

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.filter = filterInfo.css || "none";

    ctx.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.restore();
    ctx.filter = "none";

    if (filterInfo.vignette) {
        applyVignette(
            ctx,
            canvas.width,
            canvas.height,
            filterInfo.vignette
        );
    }

    drawDateStamp(ctx, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
}

function loadImages(imageDataArray) {
    return Promise.all(
        imageDataArray.map((src) =>
            new Promise((resolve, reject) => {
                const img = new Image();

                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            })
        )
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE PHOTO STRIPS
// ═══════════════════════════════════════════════════════════════════════════

function createPhotoStrip(imageDataArray) {
    if (classicMode === "custom") {
        if (!customTemplate) {
            throw new Error("Upload a template first.");
        }

        return CustomTemplate.compose(imageDataArray, customTemplate);
    }

    const layout = CLASSIC_LAYOUT;

    const gap = 12;
    const padding = 24;

    return loadImages(imageDataArray).then((loaded) => {
        let cellW = loaded[0].width;
        let cellH = loaded[0].height;

        const maxWidth = 1800;

        const naturalWidth =
            layout.cols * cellW +
            (layout.cols - 1) * gap +
            padding * 2;

        if (naturalWidth > maxWidth) {
            const scale =
                (maxWidth - (layout.cols - 1) * gap - padding * 2) /
                (layout.cols * cellW);

            cellW = Math.round(cellW * scale);
            cellH = Math.round(cellH * scale);
        }

        const canvas = document.createElement("canvas");

        canvas.width =
            layout.cols * cellW +
            (layout.cols - 1) * gap +
            padding * 2;

        canvas.height =
            layout.rows * cellH +
            (layout.rows - 1) * gap +
            padding * 2;

        const ctx = canvas.getContext("2d");

        ctx.fillStyle = classicBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        loaded.forEach((img, index) => {
            const col = index % layout.cols;
            const row = Math.floor(index / layout.cols);

            const x = padding + col * (cellW + gap);
            const y = padding + row * (cellH + gap);

            ctx.drawImage(img, x, y, cellW, cellH);
        });

        return canvas.toDataURL("image/png");
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// GALLERY
// ═══════════════════════════════════════════════════════════════════════════

function updateEmptyState() {
    const hasPhotos = gallery.querySelector(".photo-item") !== null;

    sessionEmpty.classList.toggle("hidden", hasPhotos);

    sessionEmpty.textContent = hasPhotos
        ? "Select photos to download or remove them."
        : "Your photos will appear here.";
}

function setPreviewZoom(level) {
    previewZoom = Math.max(0.8, Math.min(3, level));

    if (previewImage) {
        previewImage.style.transform = `scale(${previewZoom})`;
        previewImage.style.cursor =
            previewZoom > 1 ? "grab" : "zoom-in";
    }
}

function resetPreviewZoom() {
    setPreviewZoom(1);
}

function openPreview(imageData) {
    if (!previewModal || !previewImage) return;

    previewSource = imageData;
    previewZoom = 1;

    previewImage.src = imageData;
    previewImage.alt = "Photo strip preview";
    previewImage.style.transform = "scale(1)";

    const img = new Image();

    img.onload = () => {
        const maxWidth = Math.min(window.innerWidth * 0.9, 900);
        const maxHeight = Math.min(window.innerHeight * 0.82, 900);

        const ratio = img.width / img.height;

        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            width = maxWidth;
            height = width / ratio;
        }

        if (height > maxHeight) {
            height = maxHeight;
            width = height * ratio;
        }

        previewImage.style.width = `${Math.round(width)}px`;
        previewImage.style.height = `${Math.round(height)}px`;
    };

    img.src = imageData;

    previewModal.classList.remove("hidden");
    previewModal.setAttribute("aria-hidden", "false");
}

function closePreview() {
    if (!previewModal || !previewImage) return;

    previewModal.classList.add("hidden");
    previewModal.setAttribute("aria-hidden", "true");

    previewImage.removeAttribute("src");

    previewZoom = 1;
    previewSource = null;

    previewImage.style.transform = "scale(1)";
}

if (previewModal) {
    previewModal.addEventListener("click", (event) => {
        if (
            event.target.classList.contains("preview-backdrop") ||
            event.target === previewModal
        ) {
            closePreview();
        }
    });
}

if (closePreviewBtn) {
    closePreviewBtn.addEventListener("click", closePreview);
}

if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
        setPreviewZoom(previewZoom + 0.25);
    });
}

if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
        setPreviewZoom(previewZoom - 0.25);
    });
}

if (zoomResetBtn) {
    zoomResetBtn.addEventListener("click", resetPreviewZoom);
}

if (previewImage) {
    previewImage.addEventListener("wheel", (event) => {
        if (
            !previewModal ||
            previewModal.classList.contains("hidden")
        ) {
            return;
        }

        event.preventDefault();

        const delta = event.deltaY < 0 ? 0.15 : -0.15;
        setPreviewZoom(previewZoom + delta);

    }, { passive: false });

    previewImage.addEventListener("dblclick", () => {
        if (previewZoom > 1) {
            resetPreviewZoom();
        } else {
            setPreviewZoom(2);
        }
    });
}

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        previewModal &&
        !previewModal.classList.contains("hidden")
    ) {
        closePreview();
    }

    if (
        !previewModal ||
        previewModal.classList.contains("hidden")
    ) {
        return;
    }

    if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setPreviewZoom(previewZoom + 0.25);
    } else if (event.key === "-") {
        event.preventDefault();
        setPreviewZoom(previewZoom - 0.25);
    } else if (event.key === "0") {
        event.preventDefault();
        resetPreviewZoom();
    }
});

function addPhotoToGallery(imageData, label) {
    const photoContainer = document.createElement("div");

    photoContainer.className = "photo-item";

    photoContainer.style.setProperty(
        "--tilt",
        `${(Math.random() * 4 - 2).toFixed(2)}deg`
    );

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.className = "photo-checkbox";
    checkbox.addEventListener("change", updateBatchButton);

    const deleteBtn = document.createElement("button");

    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Remove from session";

    deleteBtn.addEventListener("click", () => {
        photoContainer.remove();

        updateEmptyState();
        updateBatchButton();
        scheduleGalleryPersist();
    });

    const img = document.createElement("img");

    img.src = imageData;
    img.alt = label || "Captured photo";

    img.addEventListener("click", () => {
        openPreview(imageData);
    });

    const downloadBtn = document.createElement("button");

    downloadBtn.textContent = "💾 Download";
    downloadBtn.className = "download-btn";

    photoContainer.imageData = imageData;

    downloadBtn.addEventListener("click", () => {
        saveAndDownloadImage(
            photoContainer.imageData,
            `photobooth_${Date.now()}.${imageExtension(photoContainer.imageData)}`,
            downloadBtn
        );
    });

    photoContainer.appendChild(checkbox);
    photoContainer.appendChild(deleteBtn);
    photoContainer.appendChild(img);
    photoContainer.appendChild(downloadBtn);

    gallery.prepend(photoContainer);

    updateEmptyState();
    scheduleGalleryPersist();

    return photoContainer;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO STRIP CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

function saveCapturedStrip(stripDataUrl) {
    const label =
        classicMode === "custom"
            ? "Custom template strip"
            : `${CLASSIC_LAYOUT.label} strip`;

    // Save directly to the gallery. No sticker editor.
    addPhotoToGallery(stripDataUrl, label);
}

async function capturePhotoStrip() {
    if (classicMode === "custom" && !customTemplate) {
        showTemplateError("Upload a template first, or switch back to Classic.");
        return;
    }

    if (!currentStream || !video.videoWidth) {
        alert("Please wait for the camera to become ready.");
        return;
    }

    const shotCount = getActiveShots();

    const countdown = Math.min(
        60,
        Math.max(0, parseInt(timerInput.value, 10) || 0)
    );

    const shots = [];

    setControlsDisabled(true);

    try {
        for (let i = 0; i < shotCount; i++) {
            await showCountdown(countdown);

            triggerFlash();
            playShutterSound();

            shots.push(captureFrame());
        }

        const stripData = await createPhotoStrip(shots);

        saveCapturedStrip(stripData);

    } catch (error) {
        console.error("Photo strip creation error:", error);

        alert(
            "Could not create photo strip. Make sure the camera is ready and try again."
        );

    } finally {
        setControlsDisabled(false);
    }
}

stripBtn.addEventListener("click", () => {
    if (isCapturing) return;

    capturePhotoStrip();
});

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOADS
// ═══════════════════════════════════════════════════════════════════════════

function downloadBlob(dataUrl, filename) {
    const link = document.createElement("a");

    link.download = filename;
    link.href = dataUrl;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function saveAndDownloadImage(imageData, filename, button) {
    button.disabled = true;
    button.textContent = "Downloading...";

    downloadBlob(imageData, filename);

    button.textContent = "✅ Downloaded";

    setTimeout(() => {
        button.textContent = "💾 Download";
        button.disabled = false;
    }, 1500);
}

selectAllBtn.addEventListener("click", () => {
    const checkboxes = document.querySelectorAll(".photo-checkbox");

    const allChecked =
        checkboxes.length > 0 &&
        Array.from(checkboxes).every((checkbox) => checkbox.checked);

    checkboxes.forEach((checkbox) => {
        checkbox.checked = !allChecked;
    });

    selectAllBtn.textContent = allChecked
        ? "Select All"
        : "Deselect All";

    updateBatchButton();
});

batchSaveBtn.addEventListener("click", saveSelectedImages);

function updateBatchButton() {
    const count = document.querySelectorAll(
        ".photo-checkbox:checked"
    ).length;

    batchSaveBtn.classList.toggle("hidden", count === 0);

    batchSaveBtn.textContent =
        `💾 Download ${count} Selected Image${count !== 1 ? "s" : ""}`;
}

async function saveSelectedImages() {
    const selected = Array.from(
        document.querySelectorAll(".photo-checkbox:checked")
    )
        .map((checkbox) => checkbox.closest(".photo-item"))
        .filter((item) => item?.imageData);

    if (!selected.length) {
        alert("Please select at least one image.");
        return;
    }

    batchSaveBtn.disabled = true;

    batchSaveBtn.textContent =
        `Downloading ${selected.length} images...`;

    try {
        const timestamp = Date.now();

        selected.forEach((item, index) => {
            const filename =
                `photobooth_batch_${timestamp}_${index + 1}.${imageExtension(item.imageData)}`;

            downloadBlob(item.imageData, filename);
        });

        selected.forEach((item) => {
            item.querySelector(".photo-checkbox").checked = false;
        });

        selectAllBtn.textContent = "Select All";

    } catch (error) {
        console.error("Batch download error:", error);
        alert("Batch download failed.");

    } finally {
        batchSaveBtn.disabled = false;
        updateBatchButton();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FULLSCREEN
// ═══════════════════════════════════════════════════════════════════════════

function isAppFullscreen() {
    return (
        document.fullscreenElement === appContainer ||
        document.webkitFullscreenElement === appContainer ||
        document.body.classList.contains("app-fullscreen")
    );
}

function updateFullscreenButton() {
    const active = isAppFullscreen();

    fullscreenBtn.textContent = active ? "×" : "⛶";
    fullscreenBtn.title = active ? "Exit fullscreen" : "Enter fullscreen";

    fullscreenBtn.setAttribute(
        "aria-label",
        active ? "Exit fullscreen" : "Enter fullscreen"
    );
}

async function enterAppFullscreen() {
    try {
        if (appContainer.requestFullscreen) {
            document.documentElement.requestFullscreen();

        } else if (appContainer.webkitRequestFullscreen) {
            appContainer.webkitRequestFullscreen();

        } else {
            document.body.classList.add("app-fullscreen");
        }

    } catch (error) {
        console.warn("Native fullscreen unavailable. Using fallback.", error);
        document.body.classList.add("app-fullscreen");
    }

    updateFullscreenButton();
}

async function exitAppFullscreen() {
    try {
        if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();

        } else if (
            document.webkitFullscreenElement &&
            document.webkitExitFullscreen
        ) {
            document.webkitExitFullscreen();
        }

    } catch (error) {
        console.warn("Could not exit native fullscreen.", error);
    }

    document.body.classList.remove("app-fullscreen");
    updateFullscreenButton();
}

fullscreenBtn.addEventListener("click", () => {
    if (isAppFullscreen()) {
        exitAppFullscreen();
    } else {
        enterAppFullscreen();
    }
});

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        document.body.classList.contains("app-fullscreen")
    ) {
        document.body.classList.remove("app-fullscreen");
        updateFullscreenButton();
    }
});

updateFullscreenButton();

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZE APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

restoreSettings();
updateVideoFilter();
updateClassicPanel();
restoreTemplate();
restoreGallery();
updateEmptyState();
updateBatchButton();
initCameras();