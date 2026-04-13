var video = document.getElementById("video");
var captureBTN = document.getElementById("capture-btn");
var gallery = document.getElementById("gallery");
var timer = document.getElementById("timer");

//camera access
navigator.mediaDevices.getUserMedia({ 
    video: true 
}).then((stream) => {
    video.srcObject = stream;
    video.play();
}).catch((error) => {
    console.error("Error accessing camera:", error);
    alert("Camera access denied or not available. Please allow camera permissions and try again.");
});

captureBTN.addEventListener("click", () => {
    var timerValue = parseInt(timer.value) || 0;
    
    if (timerValue > 0) {
        // Start countdown
        captureBTN.disabled = true;
        timer.disabled = true;
        
        var countdown = timerValue;
        timer.value = countdown;
        
        var countdownInterval = setInterval(() => {
            countdown--;
            timer.value = countdown;
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                capturePhoto();
                captureBTN.disabled = false;
                timer.disabled = false;
            }
        }, 1000);
    } else {
        // No timer, capture immediately
        capturePhoto();
    }
});

function capturePhoto() {
    //create canvas element
    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;      
    var context = canvas.getContext("2d");
    
    // Flip horizontally to match the video display
    context.scale(-1, 1);
    context.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    
    var imageData = canvas.toDataURL("image/png");
    
    // Create photo container
    var photoContainer = document.createElement("div");
    photoContainer.className = "photo-item";
    
    //create image element
    var img = document.createElement("img");
    img.src = imageData;
    
    // Create download button
    var downloadBtn = document.createElement("button");
    downloadBtn.className = "download-btn";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", function() {
        // Create formatted date/time for filename
        var now = new Date();
        var dateString = now.getFullYear() + '-' + 
                        String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(now.getDate()).padStart(2, '0') + '_' +
                        String(now.getHours()).padStart(2, '0') + '-' +
                        String(now.getMinutes()).padStart(2, '0') + '-' +
                        String(now.getSeconds()).padStart(2, '0');
        
        var link = document.createElement("a");
        link.download = "photobooth_" + dateString + ".png";
        link.href = imageData;
        link.click();
    });
    
    // Add image and download button to container
    photoContainer.appendChild(img);
    photoContainer.appendChild(downloadBtn);
    gallery.appendChild(photoContainer);
    
    //timer
    timer.value = "Photo Captured!";
    setTimeout(() => {
        timer.value = "";
    }, 2000);
}