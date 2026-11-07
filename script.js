
// DOM Elements
const video = document.getElementById("video");
const stripBtn = document.getElementById("strip-btn");
const gallery = document.getElementById("gallery");
const timerInput = document.getElementById("timer");
const cameraSelect = document.getElementById("camera-select");
const filterSelect = document.getElementById("filter-select");
const stripLayoutPicker = document.getElementById("strip-layout-picker");
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

let currentStream = null;
let isCapturing = false;
let selectedStripLayout = "vertical-4";
let previewZoom = 1;
let previewSource = null;

// ── Persistence ─────────────────────────────────────────────────────────────

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
    } catch (_) {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (_) {
        return false;
    }
}

function saveSettings() {
    storageSet(STORAGE_KEYS.settings, {
        layout: selectedStripLayout,
        filter: filterSelect.value,
        timer: timerInput.value,
        camera: cameraSelect.value || ""
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
        const t = parseInt(saved.timer, 10);
        if (!Number.isNaN(t)) {
            timerInput.value = Math.min(60, Math.max(0, t));
        }
    }

    if (saved.layout && STRIP_LAYOUTS[saved.layout]) {
        selectedStripLayout = saved.layout;

        stripLayoutPicker.querySelectorAll(".strip-option").forEach((btn) => {
            btn.classList.toggle(
                "active",
                btn.dataset.layout === selectedStripLayout
            );
        });
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

        for (const el of items) {
            if (!el.imageData) continue;

            if (!el.storedData || el.storedSource !== el.imageData) {
                el.storedData = await compressForStorage(el.imageData);
                el.storedSource = el.imageData;
            }

            if (el.storedData) {
                entries.push({
                    data: el.storedData,
                    label: el.querySelector("img")?.alt || ""
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
            } catch (_) {}
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

            const container = addPhotoToGallery(
                entry.data,
                entry.label || "Saved strip"
            );

            container.storedData = entry.data;
            container.storedSource = entry.data;
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

// ── Strip Layouts ───────────────────────────────────────────────────────────

const STRIP_LAYOUTS = {
    "vertical-4": {
        shots: 4,
        cols: 1,
        rows: 4,
        label: "Classic 4"
    },
    "polaroid-1": {
        shots: 1,
        cols: 1,
        rows: 1,
        label: "Polaroid"
    },
    "brick-4": {
        shots: 4,
        cols: 1,
        rows: 4,
        label: "Brick 4"
    }
};

// All three camera layouts use the same landscape aspect ratio.
const LAYOUT_ASPECT = {
    "vertical-4": 4 / 3,
    "polaroid-1": 4 / 3,
    "brick-4": 4 / 3
};
// ── Filters ─────────────────────────────────────────────────────────────────

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

// ── Camera ──────────────────────────────────────────────────────────────────

async function initCameras() {
    if (!navigator.mediaDevices?.getUserMedia) {
        console.error("Camera API not supported in this browser.");

        cameraSelect.innerHTML =
            `<option value="">Camera unsupported</option>`;

        alert("This browser does not support camera access.");
        return;
    }

    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
            video: true
        });

        tempStream.getTracks().forEach((t) => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();

        const cameras = devices.filter(
            (d) => d.kind === "videoinput"
        );

        cameraSelect.innerHTML = cameras.length
            ? cameras.map((cam, i) =>
                `<option value="${cam.deviceId}">${cam.label || `Camera ${i + 1}`}</option>`
            ).join("")
            : `<option value="">No camera found</option>`;

        if (cameras.length) {
            const savedCamera = loadSettings().camera;

            const startId = cameras.some(
                (c) => c.deviceId === savedCamera
            )
                ? savedCamera
                : cameras[0].deviceId;

            cameraSelect.value = startId;

            await startCamera(startId);
            saveSettings();
        }
    } catch (err) {
        console.error("Camera init error:", err);

        cameraSelect.innerHTML =
            `<option value="">Camera unavailable</option>`;

        alert("Camera access denied or not available.");
    }
}

async function startCamera(deviceId) {
    if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
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
    } catch (err) {
        console.error("Camera start error:", err);
        alert("Could not start the selected camera.");
    }
}

cameraSelect.addEventListener("change", () => {
    if (cameraSelect.value) {
        startCamera(cameraSelect.value);
    }

    saveSettings();
});

// ── Video Filters ───────────────────────────────────────────────────────────

function updateVideoFilter() {
    const filter = FILTERS[filterSelect.value] || FILTERS.none;

    video.style.filter = filter.css || "none";
}

filterSelect.addEventListener("change", () => {
    updateVideoFilter();
    saveSettings();
});

timerInput.addEventListener("change", saveSettings);

// ── Strip Layout Picker ─────────────────────────────────────────────────────

function applyLayoutAspect(layoutId) {
    const videoWrapper = document.querySelector(".video-wrapper");

    if (videoWrapper) {
        videoWrapper.style.setProperty("--aspect", "1.333333");
        videoWrapper.style.aspectRatio = "4 / 3";
    }
}

stripLayoutPicker.addEventListener("click", (e) => {
    const option = e.target.closest(".strip-option");

    if (!option) return;

    selectedStripLayout = option.dataset.layout;

    stripLayoutPicker.querySelectorAll(".strip-option").forEach((btn) => {
        btn.classList.toggle("active", btn === option);
    });

    applyLayoutAspect(selectedStripLayout);
    saveSettings();
});

// ── Save Captured Photo Strip ───────────────────────────────────────────────

function saveCapturedStrip(stripDataUrl) {
    const layout = STRIP_LAYOUTS[selectedStripLayout];

    // Save directly to the gallery. No sticker editor.
    addPhotoToGallery(
        stripDataUrl,
        `${layout.label} strip`
    );
}

// ── Audio and Visual Effects ────────────────────────────────────────────────

function playShutterSound() {
    try {
        const ctx = new (
            window.AudioContext || window.webkitAudioContext
        )();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(800, ctx.currentTime);

        osc.frequency.exponentialRampToValueAtTime(
            100,
            ctx.currentTime + 0.08
        );

        gain.gain.setValueAtTime(0.3, ctx.currentTime);

        gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + 0.08
        );

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
}

function triggerFlash() {
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

    stripLayoutPicker.querySelectorAll(".strip-option").forEach((btn) => {
        btn.disabled = disabled;
    });

    isCapturing = disabled;
}

// ── Image Processing ────────────────────────────────────────────────────────

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

    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const text = `'${yy} ${mm} ${dd}`;

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
        LAYOUT_ASPECT[selectedStripLayout] ||
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
        imageDataArray.map(
            (src) => new Promise((resolve, reject) => {
                const img = new Image();

                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            })
        )
    );
}

function createPhotoStrip(layoutId, imageDataArray) {
    if (layoutId === "polaroid-1") {
        return createPolaroidFrame(imageDataArray[0]);
    }

    if (layoutId === "brick-4") {
        if (typeof window.createBrickStrip !== "function") {
            throw new Error("Brick 4 template is unavailable.");
        }

        return window.createBrickStrip(imageDataArray);
    }

    const layout = STRIP_LAYOUTS[layoutId];

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

        ctx.fillStyle = "#f6f0e3";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        loaded.forEach((img, i) => {
            const col = i % layout.cols;
            const row = Math.floor(i / layout.cols);

            const x = padding + col * (cellW + gap);
            const y = padding + row * (cellH + gap);

            ctx.drawImage(img, x, y, cellW, cellH);
        });

        return canvas.toDataURL("image/png");
    });
}

function createPolaroidFrame(imageData) {
    return loadImages([imageData]).then(([img]) => {
        const side = Math.round(img.width * 0.05);
        const bottom = Math.round(img.width * 0.2);

        const canvas = document.createElement("canvas");

        canvas.width = img.width + side * 2;
        canvas.height = img.height + side + bottom;

        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#f8f2e4";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(img, side, side, img.width, img.height);

        return canvas.toDataURL("image/png");
    });
}

// ── Gallery ─────────────────────────────────────────────────────────────────

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
    previewModal.addEventListener("click", (e) => {
        if (
            e.target.classList.contains("preview-backdrop") ||
            e.target === previewModal
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
    previewImage.addEventListener("wheel", (e) => {
        if (
            !previewModal ||
            previewModal.classList.contains("hidden")
        ) {
            return;
        }

        e.preventDefault();

        const delta = e.deltaY < 0 ? 0.15 : -0.15;

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

document.addEventListener("keydown", (e) => {
    if (
        e.key === "Escape" &&
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

    if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setPreviewZoom(previewZoom + 0.25);
    } else if (e.key === "-") {
        e.preventDefault();
        setPreviewZoom(previewZoom - 0.25);
    } else if (e.key === "0") {
        e.preventDefault();
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

// ── Strip Capture Mode ──────────────────────────────────────────────────────

async function capturePhotoStrip() {
    const layout = STRIP_LAYOUTS[selectedStripLayout];

    const countdown = Math.min(
        60,
        Math.max(0, parseInt(timerInput.value, 10) || 3)
    );

    const shots = [];

    setControlsDisabled(true);

    try {
        for (let i = 0; i < layout.shots; i++) {
            await showCountdown(countdown);

            triggerFlash();
            playShutterSound();

            shots.push(captureFrame());
        }

        const stripData = await createPhotoStrip(
            selectedStripLayout,
            shots
        );

        // Directly save the finished strip. No icons or sticker editor.
        saveCapturedStrip(stripData);

    } catch (err) {
        console.error(err);

        alert(
            "Could not create photo strip. Make sure the camera is ready."
        );
    } finally {
        setControlsDisabled(false);
    }
}

stripBtn.addEventListener("click", () => {
    if (isCapturing) return;

    capturePhotoStrip();
});

// ── Downloads and Batch Selection ───────────────────────────────────────────

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

function downloadBlob(dataUrl, filename) {
    const link = document.createElement("a");

    link.download = filename;
    link.href = dataUrl;
    link.style.display = "none";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
}

selectAllBtn.addEventListener("click", () => {
    const checkboxes = document.querySelectorAll(".photo-checkbox");

    const allChecked =
        checkboxes.length > 0 &&
        Array.from(checkboxes).every((cb) => cb.checked);

    checkboxes.forEach((cb) => {
        cb.checked = !allChecked;
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
        .map((cb) => cb.closest(".photo-item"))
        .filter((el) => el?.imageData);

    if (!selected.length) {
        alert("Please select at least one image.");
        return;
    }

    batchSaveBtn.disabled = true;

    batchSaveBtn.textContent =
        `Downloading ${selected.length} images...`;

    try {
        const timestamp = Date.now();

        selected.forEach((container, index) => {
            const filename =
                `photobooth_batch_${timestamp}_${index + 1}.${imageExtension(container.imageData)}`;

            downloadBlob(container.imageData, filename);
        });

        selected.forEach((container) => {
            container.querySelector(".photo-checkbox").checked = false;
        });

        selectAllBtn.textContent = "Select All";

    } catch (err) {
        console.error(err);
        alert("Batch download failed.");
    } finally {
        batchSaveBtn.disabled = false;
        updateBatchButton();
    }
}

// ── Fullscreen ──────────────────────────────────────────────────────────────

fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
});

document.addEventListener("fullscreenchange", () => {
    fullscreenBtn.title = document.fullscreenElement
        ? "Exit fullscreen"
        : "Enter fullscreen";
});

// ── Initialize Application ──────────────────────────────────────────────────

restoreSettings();
updateVideoFilter();
applyLayoutAspect(selectedStripLayout);
restoreGallery();
initCameras();