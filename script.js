// DOM Elements
const video = document.getElementById("video");
const captureBtn = document.getElementById("capture-btn");
const stripBtn = document.getElementById("strip-btn");
const gallery = document.getElementById("gallery");
const serverGallery = document.getElementById("server-gallery");
const timerInput = document.getElementById("timer");
const cameraSelect = document.getElementById("camera-select");
const filterSelect = document.getElementById("filter-select");
const stripLayoutPicker = document.getElementById("strip-layout-picker");
const countdownOverlay = document.getElementById("countdown-overlay");
const countdownNumber = document.getElementById("countdown-number");
const flashOverlay = document.getElementById("flash-overlay");
const selectAllBtn = document.getElementById("select-all-btn");
const batchSaveBtn = document.getElementById("batch-save-btn");
const refreshServerBtn = document.getElementById("refresh-server-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const sessionEmpty = document.getElementById("session-empty");
const serverEmpty = document.getElementById("server-empty");

let currentStream = null;
let isCapturing = false;
let selectedStripLayout = "vertical-4";

const STRIP_LAYOUTS = {
    "vertical-4":   { shots: 4, cols: 1, rows: 4, label: "Vertical 4" },
    "horizontal-4": { shots: 4, cols: 4, rows: 1, label: "Horizontal 4" },
    "grid-2x2":     { shots: 4, cols: 2, rows: 2, label: "2×2 Grid" },
    "vertical-3":   { shots: 3, cols: 1, rows: 3, label: "Vertical 3" },
    "horizontal-3": { shots: 3, cols: 3, rows: 1, label: "Horizontal 3" }
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

// ── Filters (live preview + capture) ────────────────────────────────────────

function updateVideoFilter() {
    video.classList.remove("filter-grayscale", "filter-sepia");
    const filter = filterSelect.value;
    if (filter === "grayscale") video.classList.add("filter-grayscale");
    else if (filter === "sepia") video.classList.add("filter-sepia");
}

filterSelect.addEventListener("change", updateVideoFilter);

// ── Strip layout picker ─────────────────────────────────────────────────────

stripLayoutPicker.addEventListener("click", (e) => {
    const option = e.target.closest(".strip-option");
    if (!option) return;

    selectedStripLayout = option.dataset.layout;
    stripLayoutPicker.querySelectorAll(".strip-option").forEach((btn) => {
        btn.classList.toggle("active", btn === option);
    });
});

// ── Audio ───────────────────────────────────────────────────────────────────

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
    } catch (_) { /* audio optional */ }
}

// ── Visual effects ──────────────────────────────────────────────────────────

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
    captureBtn.disabled = disabled;
    stripBtn.disabled = disabled;
    timerInput.disabled = disabled;
    cameraSelect.disabled = disabled;
    filterSelect.disabled = disabled;
    stripLayoutPicker.querySelectorAll(".strip-option").forEach((btn) => {
        btn.disabled = disabled;
    });
    isCapturing = disabled;
}

// ── Image processing ────────────────────────────────────────────────────────

function captureFrame() {
    if (!video.videoWidth || !video.videoHeight) {
        throw new Error("Camera not ready");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    applyFilter(ctx, canvas.width, canvas.height, filterSelect.value);

    return canvas.toDataURL("image/png");
}

function applyFilter(ctx, width, height, filter) {
    if (filter === "none") return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (filter === "grayscale") {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            data[i] = data[i + 1] = data[i + 2] = gray;
        } else if (filter === "sepia") {
            data[i]     = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        }
    }

    ctx.putImageData(imageData, 0, 0);
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
    const layout = STRIP_LAYOUTS[layoutId];
    const gap = 8;
    const padding = 16;

    return loadImages(imageDataArray).then((loaded) => {
        let cellW = loaded[0].width;
        let cellH = loaded[0].height;

        const maxWidth = 1600;
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

        ctx.fillStyle = "#ffffff";
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

// ── Gallery (session) ───────────────────────────────────────────────────────

function addPhotoToGallery(imageData, label) {
    sessionEmpty.classList.add("hidden");

    const photoContainer = document.createElement("div");
    photoContainer.className = "photo-item";

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
    downloadBtn.textContent = "💾 Save & Download";
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

async function capturePhoto() {
    triggerFlash();
    playShutterSound();
    const imageData = captureFrame();
    addPhotoToGallery(imageData);
}

async function captureWithCountdown() {
    const seconds = Math.min(60, Math.max(0, parseInt(timerInput.value, 10) || 0));
    setControlsDisabled(true);
    try {
        await showCountdown(seconds);
        await capturePhoto();
    } catch (err) {
        console.error(err);
        alert("Could not capture photo. Make sure the camera is ready.");
    } finally {
        setControlsDisabled(false);
    }
}

// ── Photo strip mode ────────────────────────────────────────────────────────

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
        addPhotoToGallery(stripData, `${layout.label} strip`);
    } catch (err) {
        console.error(err);
        alert("Could not create photo strip. Make sure the camera is ready.");
    } finally {
        setControlsDisabled(false);
    }
}

captureBtn.addEventListener("click", () => {
    if (isCapturing) return;
    captureWithCountdown();
});

stripBtn.addEventListener("click", () => {
    if (isCapturing) return;
    capturePhotoStrip();
});

// ── Save & download ─────────────────────────────────────────────────────────

async function saveAndDownloadImage(imageData, filename, button) {
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        const res = await fetch("/save-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageData, filename })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Save failed");

        downloadBlob(imageData, filename);
        button.textContent = "✅ Saved & Downloaded";
        loadServerGallery();

        setTimeout(() => {
            button.textContent = "💾 Save & Download";
            button.disabled = false;
        }, 2000);
    } catch (err) {
        console.error(err);
        alert("Save failed. Make sure the server is running (npm start).");
        button.textContent = "💾 Save & Download";
        button.disabled = false;
    }
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

// ── Batch save ──────────────────────────────────────────────────────────────

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
    batchSaveBtn.textContent = `💾 Save ${count} Selected Image${count !== 1 ? "s" : ""}`;
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
    batchSaveBtn.textContent = `Saving ${selected.length} images...`;

    try {
        const timestamp = Date.now();
        await Promise.all(
            selected.map(async (container, index) => {
                const filename = `photobooth_batch_${timestamp}_${index + 1}.png`;
                const res = await fetch("/save-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ image: container.imageData, filename })
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.message);
                downloadBlob(container.imageData, filename);
            })
        );

        selected.forEach((c) => { c.querySelector(".photo-checkbox").checked = false; });
        selectAllBtn.textContent = "Select All";
        loadServerGallery();
    } catch (err) {
        console.error(err);
        alert("Batch save failed.");
    } finally {
        batchSaveBtn.disabled = false;
        updateBatchButton();
    }
}

// ── Server gallery ──────────────────────────────────────────────────────────

async function loadServerGallery() {
    if (!serverGallery || !serverEmpty) return;

    try {
        const res = await fetch("/api/gallery");
        const data = await res.json();

        serverGallery.innerHTML = "";

        if (!data.success || !data.images.length) {
            serverEmpty.classList.remove("hidden");
            return;
        }

        serverEmpty.classList.add("hidden");

        data.images.forEach(({ filename, url, savedAt }) => {
            const item = document.createElement("div");
            item.className = "photo-item server-photo";

            const img = document.createElement("img");
            img.src = url;
            img.alt = filename;
            img.loading = "lazy";

            const meta = document.createElement("p");
            meta.className = "photo-meta";
            meta.textContent = new Date(savedAt).toLocaleString();

            const actions = document.createElement("div");
            actions.className = "photo-actions";

            const downloadBtn = document.createElement("a");
            downloadBtn.href = url;
            downloadBtn.download = filename;
            downloadBtn.className = "download-btn";
            downloadBtn.textContent = "⬇ Download";

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-server-btn";
            deleteBtn.textContent = "🗑 Delete";
            deleteBtn.addEventListener("click", async () => {
                if (!confirm(`Delete ${filename}?`)) return;
                const delRes = await fetch(`/api/gallery/${encodeURIComponent(filename)}`, { method: "DELETE" });
                const delData = await delRes.json();
                if (delData.success) {
                    item.remove();
                    if (!serverGallery.children.length) serverEmpty.classList.remove("hidden");
                } else {
                    alert("Could not delete file.");
                }
            });

            actions.appendChild(downloadBtn);
            actions.appendChild(deleteBtn);
            item.appendChild(img);
            item.appendChild(meta);
            item.appendChild(actions);
            serverGallery.appendChild(item);
        });
    } catch (err) {
        console.error("Failed to load server gallery:", err);
    }
}

if (refreshServerBtn) {
    refreshServerBtn.addEventListener("click", loadServerGallery);
}

// ── Fullscreen ────────────────────────────────────────────────────────────────

if (fullscreenBtn) {
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
}

// ── Init ──────────────────────────────────────────────────────────────────────

updateVideoFilter();
initCameras();
loadServerGallery();
