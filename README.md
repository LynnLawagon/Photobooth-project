# Photobooth Project

A modern, web-based photobooth application with live camera capture, filters, photo strips, and a server-backed gallery.

## Features

- **Live Camera Feed** — Real-time video with mirror correction and camera switching
- **Layout-Aware Camera** — The preview frame reshapes (portrait, landscape, or square) to match whichever photo strip layout you pick, and captures are cropped to match
- **Countdown Timer** — Visual overlay countdown (0–60 seconds) before capture
- **Photo Strip Mode** — Capture 3 or 4 shots and combine them into a strip, using vertical, horizontal, or grid layouts
- **Aesthetic Filters** — Black & White, Sepia, Noir, Vintage, Vivid, Cool Tone, Warm Tone, and Dreamy, applied live and baked into captures
- **Stickers** — Drop emoji stickers onto the live preview, drag them into place, and they're baked into every photo and strip shot
- **Flash & Shutter Sound** — Photobooth-style feedback on every shot
- **Session Gallery** — Preview, select, delete, and batch-download photos
- **Fullscreen Mode** — Kiosk-friendly fullscreen toggle
- **Responsive Design** — Works on desktop and mobile

## Quick Start

### Prerequisites

- Node.js 14+
- A webcam
- A modern browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
cd "Photobooth project"
npm install
```

### Running

```bash
npm start
```

Open **http://localhost:3000** in your browser and allow camera access when prompted.

## How to Use

### Single Photo

1. Choose a camera, a strip layout (this also shapes the camera preview), and an optional filter
2. Optionally tap stickers to add them to the preview, then drag them into place
3. Set the timer (seconds before capture; use `0` for instant)
4. Click **Capture**

### Photo Strip

1. Pick a strip layout — the camera preview reshapes to match it
2. Set the timer (delay between each shot)
3. Click **Start Strip**
4. Strike a pose for each countdown — all shots (with your chosen filter and stickers) are merged into one strip

### Stickers

- Click any sticker in the **Stickers** row to drop it onto the live preview
- Drag a sticker to reposition it; click its **×** to remove it
- **Clear Stickers** removes all of them at once
- Stickers are baked into every photo and strip shot while they're on the preview

### Saving Photos

- **Download** on any session photo saves it straight to your device
- Check multiple photos and use **Download Selected Images** to batch-download them

## Project Structure

```
photobooth-project/
├── index.html       # Main UI
├── style.css        # Styles
├── script.js        # Frontend logic (camera, filters, stickers, strips)
├── server.js        # Express static file server
└── package.json
```

All photo capture, filtering, and downloading happens client-side in the browser — the server just serves the static files.

## Configuration

Change the port via environment variable:

```bash
PORT=8080 npm start
```

Or edit `server.js`:

```javascript
const PORT = process.env.PORT || 3000;
```

## Troubleshooting

**Camera not working** — Check browser permissions; ensure no other app is using the webcam.

**Download didn't start** — Some browsers block automatic downloads from a page not loaded over `http://` — make sure you're accessing the app at `http://localhost:3000` (not as a local file) and check your browser's download prompt/settings.

**Port in use** — Set a different `PORT` environment variable.

## License

ISC