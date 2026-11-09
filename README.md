# Photobooth Project

A web-based photobooth experience with a live camera preview, vintage-style filters, customizable photo strips, and a session gallery for downloading your captures.

## Features

- Live camera feed with camera switching and mirrored viewing
- Countdown timer before each capture
- Photo strip styles:
  - Classic 4-photo strip, with a choice of **Classic** (pick any background color) or **My Template** (upload your own photostrip)
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
2. Set the timer delay (use 0 for instant capture).
3. Click Start Strip.
4. Pose for each countdown and let the app build your strip.

### Layout

The app is laid out like a real photobooth. On wide screens the instruction panel is on the left, the curtain and camera in the middle, and the output slot on the right. On phones it stacks: camera first, one tap for look and style, and the Start button docked at the bottom edge for your thumb. Sideways phones and tablets get their own layouts.

### Use Your Own Template

1. Under Photo Strip Style, choose **My Template**.
2. Upload (or drag in) your photostrip image. Canva exports work as they are: the sample sky-and-hills pictures in the frames are replaced with your photos, and stickers that overlap a frame stay on top. PNGs with transparent photo spots work too.
3. The app shows your template with the photo spots numbered (1 to 8). Each capture takes one photo per spot, in that order.
4. If a spot is missed or wrong, click **Adjust spots** (or it opens automatically when nothing is found) and drag boxes over where the photos should go. Tap a box to delete it.
5. The template is remembered in your browser.

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
