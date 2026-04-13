// DOM Elements
const video = document.getElementById("video");
const captureBTN = document.getElementById("capture-btn");
const gallery = document.getElementById("gallery");
const timer = document.getElementById("timer");

// CAMERA ACCESS
navigator.mediaDevices.getUserMedia({ video: true })
.then((stream) => {
    video.srcObject = stream;
    video.play();
    // Create Select All button after video loads (ensures capture btn has size)
    createSelectAllButton();
})
.catch((error) => {
    console.error("Camera error:", error);
    alert("Camera access denied or not available.");
});

// CAPTURE BUTTON
captureBTN.addEventListener("click", () => {
    const timerValue = parseInt(timer.value) || 0;

    if (timerValue > 0) {
        captureBTN.disabled = true;
        timer.disabled = true;

        let countdown = timerValue;
        timer.value = countdown;

        const interval = setInterval(() => {
            countdown--;
            timer.value = countdown;

            if (countdown <= 0) {
                clearInterval(interval);
                capturePhoto();
                captureBTN.disabled = false;
                timer.disabled = false;
            }
        }, 1000);
    } else {
        capturePhoto();
    }
});

// Create Select All button (EXACT SAME SIZE as capture button)
function createSelectAllButton() {
    const selectAllBtn = document.createElement("button");
    selectAllBtn.id = "select-all-btn";
    selectAllBtn.textContent = "💾 Select All";
    
    // Copy EXACT dimensions and styling
    selectAllBtn.style.cssText = `
        padding: 15px 30px;
        font-size: 18px;
        font-weight: bold;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        text-transform: uppercase;
        letter-spacing: 1px;
    `;

    selectAllBtn.addEventListener("click", () => {
        const checkboxes = document.querySelectorAll(".photo-checkbox");
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateBatchButton();
        
        selectAllBtn.textContent = allChecked ? "Select All" : "Deselect All";
    });

    // Insert next to capture button
    captureBTN.parentNode.insertBefore(selectAllBtn, captureBTN.nextSibling);
}

// CAPTURE FUNCTION
function capturePhoto() {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/png");

    const photoContainer = document.createElement("div");
    photoContainer.className = "photo-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "photo-checkbox";

    const img = document.createElement("img");
    img.src = imageData;

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "💾 Save & Download";
    downloadBtn.className = "download-btn";

    photoContainer.imageData = imageData;

    downloadBtn.addEventListener("click", () => saveAndDownloadImage(imageData, `photobooth_${Date.now()}.png`, downloadBtn));
    checkbox.addEventListener("change", updateBatchButton);

    photoContainer.appendChild(checkbox);
    photoContainer.appendChild(img);
    photoContainer.appendChild(downloadBtn);
    gallery.appendChild(photoContainer);

    timer.value = "Captured!";
    setTimeout(() => timer.value = "", 2000);
}

// Save and download single image
async function saveAndDownloadImage(imageData, filename, button) {
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        const res = await fetch("http://localhost:3000/save-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageData, filename })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Save failed");

        // Download
        const link = document.createElement("a");
        link.download = filename;
        link.href = imageData;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        button.textContent = "✅ Saved & Downloaded";
        setTimeout(() => {
            button.textContent = "💾 Save & Download";
            button.disabled = false;
        }, 2000);

    } catch (err) {
        console.error(err);
        alert("Save failed. Server might not be running.");
        button.textContent = "💾 Save & Download";
        button.disabled = false;
    }
}

// Batch save
async function saveSelectedImages() {
    const selectedPhotos = Array.from(document.querySelectorAll(".photo-checkbox:checked"))
        .map(cb => cb.parentElement)
        .filter(container => container.imageData);

    if (selectedPhotos.length === 0) {
        alert("Please select at least one image.");
        return;
    }

    const batchBtn = document.querySelector(".batch-save-btn");
    batchBtn.disabled = true;
    batchBtn.textContent = `Saving ${selectedPhotos.length} images...`;

    try {
        await Promise.all(
            selectedPhotos.map((container, index) => 
                fetch("http://localhost:3000/save-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        image: container.imageData,
                        filename: `photobooth_batch_${Date.now()}_${index + 1}.png`
                    })
                }).then(res => res.json())
            )
        );

        alert(`${selectedPhotos.length} images saved to gallery!`);
        selectedPhotos.forEach(container => container.querySelector(".photo-checkbox").checked = false);

    } catch (err) {
        console.error(err);
        alert("Batch save failed.");
    } finally {
        batchBtn.disabled = false;
        batchBtn.textContent = "💾 Save Selected Images";
        updateBatchButton();
    }
}

function updateBatchButton() {
    const batchBtn = document.querySelector(".batch-save-btn");
    const count = document.querySelectorAll(".photo-checkbox:checked").length;

    if (count > 0) {
        batchBtn.style.display = "block";
        batchBtn.textContent = `💾 Save ${count} Selected Image${count > 1 ? 's' : ''}`;
    } else {
        batchBtn.style.display = "none";
    }
}

function createBatchSaveButton() {
    const existing = document.querySelector(".batch-save-btn");
    if (existing) existing.remove();

    const batchBtn = document.createElement("button");
    batchBtn.className = "batch-save-btn";
    batchBtn.textContent = "💾 Save Selected Images";
    batchBtn.addEventListener("click", saveSelectedImages);

    gallery.parentNode.insertBefore(batchBtn, gallery.nextSibling);
}

createBatchSaveButton();
gallery.addEventListener("change", (e) => {
    if (e.target.classList.contains("photo-checkbox")) {
        updateBatchButton();
    }
});