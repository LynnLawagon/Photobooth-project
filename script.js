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

// Sticker Editor Elements
const stickerEditorModal = document.getElementById("sticker-editor-modal");
const editorPreviewArea = document.getElementById("editor-preview-area");
const editingImage = document.getElementById("editing-image");
const closeEditorBtn = document.getElementById("close-editor-btn");
const stickerLayer = document.getElementById("sticker-layer");
const stickerPalette = document.getElementById("sticker-palette");
const clearStickersBtn = document.getElementById("clear-stickers-btn");

//zoom controls
const zoomSlider = document.getElementById('zoom-slider');
const zoomContainer = document.getElementById('zoom-container');

let currentStream = null;
let isCapturing = false;
let selectedStripLayout = "vertical-4";
let stickerIdCounter = 0;
let stickers = []; 
let activeRawStripData = null;

//zoom controls
if (zoomSlider && zoomContainer) {
    zoomSlider.addEventListener('input', (e) => {
        const scale = e.target.value;
        zoomContainer.style.transform = `scale(${scale})`;
    });
}

const STRIP_LAYOUTS = {
    "vertical-4": { shots: 4, cols: 1, rows: 4, label: "Classic 4" },
    "polaroid-1": { shots: 1, cols: 1, rows: 1, label: "Polaroid" }
};

const LAYOUT_ASPECT = {
    "vertical-4": 3 / 4,
    "polaroid-1": 1
};

const FILTERS = {
    none:       { css: "" },
    grayscale:{ css: "grayscale(100%)" },
    sepia:    { css: "sepia(100%)" },
    noir:     { css: "grayscale(100%) contrast(140%) brightness(85%)", vignette: 0.45 },
    vintage:  { css: "sepia(55%) saturate(75%) contrast(90%) brightness(105%)", vignette: 0.3 },
    vivid:    { css: "saturate(165%) contrast(115%) brightness(105%)" },
    cool:     { css: "saturate(115%) hue-rotate(15deg) brightness(105%)" },
    warm:     { css: "saturate(120%) sepia(18%) brightness(108%)" },
    dreamy:   { css: "contrast(85%) brightness(112%) saturate(80%) blur(0.5px)" }
};

// ── Camera ──────────────────────────────────────────────────────────────────

async function initCameras() {
    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach((t) => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((d) => d.kind === "videoinput");

        cameraSelect.innerHTML = cameras.length
            ? cameras.map((cam, i) =>
                `<option value="${cam.deviceId}">${cam.label || `Camera ${i + 1}`}</option>`
              ).join("")
            : `<option value="">No camera found</option>`;

        if (cameras.length) {
            await startCamera(cameras[0].deviceId);
        }
    } catch (err) {
        console.error("Camera init error:", err);
        cameraSelect.innerHTML = `<option value="">Camera unavailable</option>`;
        alert("Camera access denied or not available.");
    }
}

async function startCamera(deviceId) {
    if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
    }

    const constraints = {
        video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } }
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        await video.play();
    } catch (err) {
        console.error("Camera start error:", err);
        alert("Could not start the selected camera.");
    }
}

cameraSelect.addEventListener("change", () => {
    if (cameraSelect.value) startCamera(cameraSelect.value);
});

// ── Filters ─────────────────────────────────────────────────────────────────

function updateVideoFilter() {
    const filter = FILTERS[filterSelect.value] || FILTERS.none;
    video.style.filter = filter.css || "none";
}

filterSelect.addEventListener("change", updateVideoFilter);

// ── Strip layout picker ─────────────────────────────────────────────────────

function applyLayoutAspect(layoutId) {
    const aspect = LAYOUT_ASPECT[layoutId] || 0.75;
    const videoWrapper = document.querySelector(".video-wrapper");
    if (videoWrapper) videoWrapper.style.aspectRatio = String(aspect);
}

stripLayoutPicker.addEventListener("click", (e) => {
    const option = e.target.closest(".strip-option");
    if (!option) return;

    selectedStripLayout = option.dataset.layout;
    stripLayoutPicker.querySelectorAll(".strip-option").forEach((btn) => {
        btn.classList.toggle("active", btn === option);
    });
    applyLayoutAspect(selectedStripLayout);
});

// ── Post-Capture Stickers & Editor ──────────────────────────────────────────

function openStickerEditor(stripDataUrl) {
    activeRawStripData = stripDataUrl;
    editingImage.src = stripDataUrl;
    clearStickers();
    stickerEditorModal.classList.remove("hidden");
}

closeEditorBtn.addEventListener("click", () => {
    burnStickersAndSave();
});

function addSticker(emoji) {
    const id = `sticker-${stickerIdCounter++}`;
    const previewRect = editorPreviewArea.getBoundingClientRect();
    const sizePx = Math.max(48, previewRect.width * 0.16);
    const sizePercent = (sizePx / previewRect.width) * 100;

    const el = document.createElement("div");
    el.className = "sticker";
    el.style.left = "50%";
    el.style.top = "50%";

    const content = document.createElement("span");
    content.className = "sticker-content";
    content.style.fontSize = `${sizePx}px`;
    content.textContent = emoji;
    el.appendChild(content);

    const controls = document.createElement("div");
    controls.className = "sticker-controls";

    const removeBtn = document.createElement("div");
    removeBtn.className = "sticker-handle remove-handle";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeSticker(id);
    });
    controls.appendChild(removeBtn);

    const resizeBtn = document.createElement("div");
    resizeBtn.className = "sticker-handle resize-handle";
    resizeBtn.textContent = "⤢";
    controls.appendChild(resizeBtn);

    const rotateBtn = document.createElement("div");
    rotateBtn.className = "sticker-handle rotate-handle";
    rotateBtn.textContent = "↻";
    controls.appendChild(rotateBtn);

    el.appendChild(controls);

    const stickerData = { id, emoji, xPercent: 50, yPercent: 50, sizePercent, rotation: 0, el, content };
    stickers.push(stickerData);
    setupStickerInteractions(el, stickerData, resizeBtn, rotateBtn);
    setActiveSticker(stickerData);
    stickerLayer.appendChild(el);
}

function setActiveSticker(targetSticker) {
    stickers.forEach((s) => s.el.classList.toggle("active", s === targetSticker));
}

function removeSticker(id) {
    const idx = stickers.findIndex((s) => s.id === id);
    if (idx === -1) return;
    stickers[idx].el.remove();
    stickers.splice(idx, 1);
}

function clearStickers() {
    stickers.forEach((s) => s.el.remove());
    stickers.length = 0;
}

document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".sticker") && !e.target.closest(".sticker-palette")) {
        stickers.forEach((s) => s.el.classList.remove("active"));
    }
});

if (stickerPalette) {
    stickerPalette.addEventListener("click", (e) => {
        const option = e.target.closest(".sticker-option");
        if (!option) return;
        const emoji = option.dataset.emoji || option.textContent.trim();
        if (emoji) addSticker(emoji);
    });
}

if (clearStickersBtn) {
    clearStickersBtn.addEventListener("click", clearStickers);
}

function setupStickerInteractions(el, sticker, resizeBtn, rotateBtn) {
    el.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("sticker-handle")) return;
        e.preventDefault();
        setActiveSticker(sticker);
        el.setPointerCapture(e.pointerId);
        el.classList.add("dragging");

        const onMove = (ev) => {
            const rect = editorPreviewArea.getBoundingClientRect();
            let xPercent = ((ev.clientX - rect.left) / rect.width) * 100;
            let yPercent = ((ev.clientY - rect.top) / rect.height) * 100;
            sticker.xPercent = Math.min(100, Math.max(0, xPercent));
            sticker.yPercent = Math.min(100, Math.max(0, yPercent));
            el.style.left = `${sticker.xPercent}%`;
            el.style.top = `${sticker.yPercent}%`;
        };

        const onUp = () => {
            el.classList.remove("dragging");
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    });

    resizeBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        resizeBtn.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const startSize = sticker.sizePercent;
        const wrapperRect = editorPreviewArea.getBoundingClientRect();

        const onMove = (ev) => {
            const deltaX = ev.clientX - startX;
            const deltaPercent = (deltaX / wrapperRect.width) * 100;
            let newSize = Math.max(5, Math.min(70, startSize + deltaPercent * 1.5));
            sticker.sizePercent = newSize;
            const sizePx = (newSize / 100) * wrapperRect.width;
            sticker.content.style.fontSize = `${sizePx}px`;
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    });

    rotateBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        rotateBtn.setPointerCapture(e.pointerId);

        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const startRotation = sticker.rotation;
        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

        const onMove = (ev) => {
            const currentAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * (180 / Math.PI);
            const deltaAngle = currentAngle - startAngle;
            sticker.rotation = Math.round((startRotation + deltaAngle) % 360);
            sticker.content.style.transform = `rotate(${sticker.rotation}deg)`;
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    });
}

function burnStickersAndSave() {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0);

        stickers.forEach((s) => {
            ctx.save();
            const x = (s.xPercent / 100) * canvas.width;
            const y = (s.yPercent / 100) * canvas.height;
            ctx.translate(x, y);
            ctx.rotate((s.rotation * Math.PI) / 180);

            const fontSize = (s.sizePercent / 100) * canvas.width;
            ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(s.emoji, 0, 0);
            ctx.restore();
        });

        const finalDataUrl = canvas.toDataURL("image/png");
        stickerEditorModal.classList.add("hidden");
        const layout = STRIP_LAYOUTS[selectedStripLayout];
        addPhotoToGallery(finalDataUrl, `${layout.label} strip`);
    };
    img.src = activeRawStripData;
}

// ── Audio & Visual ──────────────────────────────────────────────────────────

function playShutterSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
}

function triggerFlash() {
    flashOverlay.classList.add("flash-active");
    setTimeout(() => flashOverlay.classList.remove("flash-active"), 150);
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
    stripLayoutPicker.querySelectorAll(".strip-option").forEach((btn) => { btn.disabled = disabled; });
    isCapturing = disabled;
}

// ── Image Processing ────────────────────────────────────────────────────────

function getCoverCropRect(srcWidth, srcHeight, targetAspect) {
    const srcAspect = srcWidth / srcHeight;
    let sx = 0, sy = 0, sw = srcWidth, sh = srcHeight;

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
        width / 2, height / 2, Math.min(width, height) * 0.25,
        width / 2, height / 2, Math.min(width, height) * 0.7
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

    const fontSize = Math.max(12, Math.round(canvasWidth * 0.032));
    ctx.save();
    ctx.font = `italic bold ${fontSize}px "Courier New", monospace`;
    ctx.fillStyle = "rgba(255, 140, 40, 0.85)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 2;
    ctx.fillText(text, canvasWidth - fontSize * 0.6, canvasHeight - fontSize * 0.6);
    ctx.restore();
}

function captureFrame() {
    if (!video.videoWidth || !video.videoHeight) {
        throw new Error("Camera not ready");
    }

    const targetAspect = LAYOUT_ASPECT[selectedStripLayout] || (video.videoWidth / video.videoHeight);
    const { sx, sy, sw, sh } = getCoverCropRect(video.videoWidth, video.videoHeight, targetAspect);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * 1.5);
    canvas.height = Math.round(sh * 1.5);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const filterInfo = FILTERS[filterSelect.value] || FILTERS.none;

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.filter = filterInfo.css || "none";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.filter = "none";
    if (filterInfo.vignette) {
        applyVignette(ctx, canvas.width, canvas.height, filterInfo.vignette);
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

    const layout = STRIP_LAYOUTS[layoutId];
    const gap = 12;
    const padding = 24;

    return loadImages(imageDataArray).then((loaded) => {
        let cellW = loaded[0].width;
        let cellH = loaded[0].height;

        const maxWidth = 1800;
        const naturalWidth = layout.cols * cellW + (layout.cols - 1) * gap + padding * 2;
        if (naturalWidth > maxWidth) {
            const scale = (maxWidth - (layout.cols - 1) * gap - padding * 2) / (layout.cols * cellW);
            cellW = Math.round(cellW * scale);
            cellH = Math.round(cellH * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = layout.cols * cellW + (layout.cols - 1) * gap + padding * 2;
        canvas.height = layout.rows * cellH + (layout.rows - 1) * gap + padding * 2;
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

function addPhotoToGallery(imageData, label) {
    sessionEmpty.classList.add("hidden");

    const photoContainer = document.createElement("div");
    photoContainer.className = "photo-item";
    photoContainer.style.setProperty("--tilt", `${(Math.random() * 4 - 2).toFixed(2)}deg`);

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
        if (!gallery.children.length) sessionEmpty.classList.remove("hidden");
        updateBatchButton();
    });

    const img = document.createElement("img");
    img.src = imageData;
    img.alt = label || "Captured photo";

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "💾 Download";
    downloadBtn.className = "download-btn";

    photoContainer.imageData = imageData;

    downloadBtn.addEventListener("click", () =>
        saveAndDownloadImage(imageData, `photobooth_${Date.now()}.png`, downloadBtn)
    );

    photoContainer.appendChild(checkbox);
    photoContainer.appendChild(deleteBtn);
    photoContainer.appendChild(img);
    photoContainer.appendChild(downloadBtn);
    gallery.prepend(photoContainer);
}

// ── Strip Capture Mode ──────────────────────────────────────────────────────

async function capturePhotoStrip() {
    const layout = STRIP_LAYOUTS[selectedStripLayout];
    const countdown = Math.min(60, Math.max(0, parseInt(timerInput.value, 10) || 3));
    const shots = [];
    setControlsDisabled(true);

    try {
        for (let i = 0; i < layout.shots; i++) {
            await showCountdown(countdown);
            triggerFlash();
            playShutterSound();
            shots.push(captureFrame());
        }

        const stripData = await createPhotoStrip(selectedStripLayout, shots);
        openStickerEditor(stripData);
    } catch (err) {
        console.error(err);
        alert("Could not create photo strip. Make sure the camera is ready.");
    } finally {
        setControlsDisabled(false);
    }
}

stripBtn.addEventListener("click", () => {
    if (isCapturing) return;
    capturePhotoStrip();
});

// ── Downloads & Batch ───────────────────────────────────────────────────────

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
    const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every((cb) => cb.checked);
    checkboxes.forEach((cb) => { cb.checked = !allChecked; });
    selectAllBtn.textContent = allChecked ? "Select All" : "Deselect All";
    updateBatchButton();
});

batchSaveBtn.addEventListener("click", saveSelectedImages);

function updateBatchButton() {
    const count = document.querySelectorAll(".photo-checkbox:checked").length;
    batchSaveBtn.classList.toggle("hidden", count === 0);
    batchSaveBtn.textContent = `💾 Download ${count} Selected Image${count !== 1 ? "s" : ""}`;
}

async function saveSelectedImages() {
    const selected = Array.from(document.querySelectorAll(".photo-checkbox:checked"))
        .map((cb) => cb.closest(".photo-item"))
        .filter((el) => el?.imageData);

    if (!selected.length) {
        alert("Please select at least one image.");
        return;
    }

    batchSaveBtn.disabled = true;
    batchSaveBtn.textContent = `Downloading ${selected.length} images...`;

    try {
        const timestamp = Date.now();
        selected.forEach((container, index) => {
            const filename = `photobooth_batch_${timestamp}_${index + 1}.png`;
            downloadBlob(container.imageData, filename);
        });

        selected.forEach((c) => { c.querySelector(".photo-checkbox").checked = false; });
        selectAllBtn.textContent = "Select All";
    } catch (err) {
        console.error(err);
        alert("Batch download failed.");
    } finally {
        batchSaveBtn.disabled = false;
        updateBatchButton();
    }
}

fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
});

document.addEventListener("fullscreenchange", () => {
    fullscreenBtn.title = document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen";
});

// ── Init ──────────────────────────────────────────────────────────────────────

updateVideoFilter();
applyLayoutAspect(selectedStripLayout);
initCameras();