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

async function saveTemplateFile(file) {
    try {
        await templateDbRun("readwrite", (store) =>
            store.put(file, TEMPLATE_KEY)
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
        return await templateDbRun("readonly", (store) =>
            store.get(TEMPLATE_KEY)
        );
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

async function loadTemplateFile(file, { remember = true } = {}) {
    showTemplateError("");

    try {
        const analyzed = await CustomTemplate.analyze(file);

        customTemplate = analyzed;

        if (remember) await saveTemplateFile(file);

        updateClassicPanel();
        return true;

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
    if (!window.CustomTemplate) return;

    const file = await loadSavedTemplateFile();

    if (!file) return;

    try {
        customTemplate = await CustomTemplate.analyze(file);
        updateClassicPanel();
    } catch (error) {
        await clearTemplateFile();
    }
}

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