const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const galleryPath = path.join(__dirname, "gallery");

if (!fs.existsSync(galleryPath)) {
    fs.mkdirSync(galleryPath, { recursive: true });
}

app.use(express.static(__dirname));
app.use("/gallery", express.static(galleryPath));

app.get("/api/gallery", (_req, res) => {
    try {
        const files = fs.readdirSync(galleryPath)
            .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
            .map((filename) => ({
                filename,
                url: `/gallery/${encodeURIComponent(filename)}`,
                savedAt: fs.statSync(path.join(galleryPath, filename)).mtime
            }))
            .sort((a, b) => b.savedAt - a.savedAt);

        res.json({ success: true, images: files });
    } catch (err) {
        console.error("Error listing gallery:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/gallery/:filename", (req, res) => {
    try {
        const safeName = path.basename(req.params.filename);
        const filePath = path.join(galleryPath, safeName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: "File not found" });
        }

        fs.unlinkSync(filePath);
        console.log("Deleted image:", filePath);
        res.json({ success: true, filename: safeName });
    } catch (err) {
        console.error("Error deleting image:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/save-image", (req, res) => {
    try {
        const { image, filename } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, message: "No image received" });
        }

        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const safeName = filename ? path.basename(filename) : null;
        const finalName = safeName
            ? (safeName.match(/\.(png|jpg|jpeg|webp)$/i) ? safeName : `${safeName}.png`)
            : `photo_${Date.now()}.png`;
        const filePath = path.join(galleryPath, finalName);

        fs.writeFileSync(filePath, base64Data, "base64");
        console.log("Saved image:", filePath);

        res.json({
            success: true,
            filename: finalName,
            url: `/gallery/${encodeURIComponent(finalName)}`
        });
    } catch (err) {
        console.error("Error saving image:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Photobooth running at http://localhost:${PORT}`);
});
