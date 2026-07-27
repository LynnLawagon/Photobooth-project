# Photobooth Project

A web-based photobooth experience with a live camera preview, vintage-style filters, customizable photo strips, and a session gallery for downloading your captures.

## Features

- Live camera feed with camera switching and mirrored viewing
- Countdown timer before each capture
- Two strip layouts:
  - Classic 4-photo strip
  - Polaroid-style single frame
- Film-style filters including grayscale, sepia, noir, vintage, vivid, cool, warm, and dreamy
- Flash and shutter sound effects for a playful photobooth feel
- Gallery of captured images with preview, delete, select, and batch download options
- Popup preview for viewing each strip image in a larger format with zoom controls
- Fullscreen mode for a kiosk-style experience

## Quick Start

### Prerequisites

- Node.js 18+
- A webcam
- A modern browser such as Chrome, Edge, Firefox, or Safari

### Installation

`ash
cd "Photobooth project"
npm install
`

### Running

`ash
npm start
`

Open http://localhost:3000 in your browser and allow camera access when prompted.

## How to Use

### Capture a Strip

1. Choose your camera and filter.
2. Pick a strip layout.
3. Set the timer delay (use 0 for instant capture).
4. Click Start Strip.
5. Pose for each countdown and let the app build your strip.

### View and Save Photos

- Click any photo in the gallery to open a larger popup preview.
- Use the zoom controls or mouse wheel to inspect the image closely.
- Click Download to save a single image.
- Select multiple images and use Download Selected Images to batch save them.

## Project Structure

`	ext
photobooth-project/
├── index.html       # Main UI and modal preview markup
├── style.css        # Styling for the app, gallery, and preview popup
├── script.js        # Camera, filters, strip creation, and gallery logic
├── server.js        # Express static file server
└── package.json
`

All capture, editing, and download actions happen in the browser. The server simply serves the app locally.

## Configuration

Change the port with an environment variable:

`ash
PORT=8080 npm start
`

You can also update the port directly in server.js:

`javascript
const PORT = process.env.PORT || 3000;
`

## Troubleshooting

- Camera not working: check browser camera permissions and ensure no other app is using the webcam.
- Downloads not starting: make sure you are opening the app at http://localhost:3000 and allow downloads in your browser.
- Port already in use: set a different PORT value.

## License

ISC
