const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// Define a explicit root route if index.html isn't automatically caught
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Only listen locally, export for Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Photobooth running at http://localhost:${PORT}`);
  });
}

module.exports = app;