const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Serves index.html, style.css, script.js, etc. Photos are captured and
// downloaded entirely in the browser, so no upload/storage endpoints are needed.
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Photobooth running at http://localhost:${PORT}`);
});