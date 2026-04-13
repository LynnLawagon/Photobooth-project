var video = document.getElementById("video");
var captureBTN = document.getElementById("capture-btn");
var gallery = document.getElementById("gallery");
var timer = document.getElementById("timer");

// CAMERA ACCESS
navigator.mediaDevices.getUserMedia({ video: true })
.then((stream) => {
    video.srcObject = stream;
    video.play();
})
.catch((error) => {
    console.error("Camera error:", error);
    alert("Camera access denied or not available.");
});

// CAPTURE BUTTON
captureBTN.addEventListener("click", () => {
    var timerValue = parseInt(timer.value) || 0;

    if (timerValue > 0) {
        captureBTN.disabled = true;
        timer.disabled = true;

        var countdown = timerValue;
        timer.value = countdown;

        var interval = setInterval(() => {
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

// CAPTURE FUNCTION
function capturePhoto() {

    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    var ctx = canvas.getContext("2d");

    // mirror camera
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);

    var imageData = canvas.toDataURL("image/png");

    // UI container
    var photoContainer = document.createElement("div");
    photoContainer.className = "photo-item";

    var img = document.createElement("img");
    img.src = imageData;

    var downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Save & Download";
    downloadBtn.className = "download-btn";

    downloadBtn.addEventListener("click", async function () {
        var filename = "photobooth_" + Date.now() + ".png";

        // Save the image into the local gallery folder via backend
        try {
            const res = await fetch("http://localhost:3000/save-image", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    image: imageData,
                    filename: filename
                })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || "Save failed");
            }
            console.log("Saved to gallery:", data.path || data.filename);
        } catch (err) {
            console.error(err);
            alert("Unable to save image to gallery. Make sure the server is running.");
        }

        // Trigger browser download too
        var link = document.createElement("a");
        link.download = filename;
        link.href = imageData;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    photoContainer.appendChild(img);
    photoContainer.appendChild(downloadBtn);
    gallery.appendChild(photoContainer);

    timer.value = "Captured!";
    setTimeout(() => timer.value = "", 2000);
}