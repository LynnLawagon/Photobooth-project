const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Gallery folder
const galleryPath = path.join(__dirname, "gallery");

// Ensure folder exists
if (!fs.existsSync(galleryPath)) {
    fs.mkdirSync(galleryPath, { recursive: true });
}

app.post("/save-image", (req, res) => {
    try {
        const { image, filename } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, message: "No image received" });
        }

        const base64Data = image.replace(/^data:image\/png;base64,/, "");
        const safeName = filename ? path.basename(filename) : null;
        const finalName = safeName ? (safeName.endsWith(".png") ? safeName : safeName + ".png") : `photo_${Date.now()}.png`;
        const filePath = path.join(galleryPath, finalName);

        fs.writeFileSync(filePath, base64Data, "base64");

        console.log("Saved image:", filePath);

        res.json({
            success: true,
            filename: finalName,
            path: filePath
        });

    } catch (err) {
        console.error("Error saving image:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});