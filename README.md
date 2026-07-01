# Photobooth Project

A modern, web-based photobooth application with live camera capture, filters, photo strips, and a server-backed gallery.

## Features

- **Live Camera Feed** — Real-time video with mirror correction and camera switching
- **Countdown Timer** — Visual overlay countdown (0–60 seconds) before capture
- **Photo Strip Mode** — Capture 4 shots and combine them into a classic vertical strip
- **Filters** — Black & white and sepia applied at capture time
- **Flash & Shutter Sound** — Photobooth-style feedback on every shot
- **Session Gallery** — Preview, select, delete, and batch-save photos before committing
- **Server Gallery** — Browse, download, and delete photos saved to disk
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

1. Choose a camera and optional filter
2. Set the timer (seconds before capture; use `0` for instant)
3. Click **Capture**

### Photo Strip

1. Set the timer (delay between each of the 4 shots)
2. Click **Photo Strip**
3. Strike a pose for each countdown — all 4 photos are merged into one strip

### Saving Photos

- **Save & Download** on any session photo saves to the server `gallery/` folder and downloads locally
- Check multiple photos and use **Save Selected Images** for batch save + download
- Saved photos appear in the **Saved on Server** section below

## Project Structure

```
photobooth-project/
├── index.html       # Main UI
├── style.css        # Styles
├── script.js        # Frontend logic
├── server.js        # Express server (static files + API)
├── package.json
└── gallery/         # Saved photos (auto-created)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/save-image` | Save a base64 image to gallery |
| `GET`  | `/api/gallery` | List saved images |
| `DELETE` | `/api/gallery/:filename` | Delete a saved image |
| `GET`  | `/gallery/:filename` | Serve a saved image file |

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

**Save failed** — Make sure `npm start` is running and you're accessing the app at `http://localhost:3000` (not as a local file).

**Port in use** — Set a different `PORT` environment variable.

## License

ISC
