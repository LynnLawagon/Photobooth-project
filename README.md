# Photobooth Project

A modern, web-based photobooth application that allows users to capture photos with a countdown timer and automatically save images to a local gallery.

## ✨ Features

- **Live Camera Feed**: Real-time video capture with automatic horizontal flip correction
- **Countdown Timer**: Optional countdown before photo capture (1-60 seconds)
- **Automatic Saving**: Photos are automatically saved to a local gallery folder
- **Download Functionality**: Download individual photos with timestamped filenames
- **Responsive Design**: Modern, mobile-friendly interface with gradient backgrounds

## 🚀 Quick Start

### Prerequisites

- **Node.js** (version 14 or higher)
- **npm** (comes with Node.js)
- **Webcam** (built-in or external)
- **Modern web browser** (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone or download** the project files to your local machine

2. **Navigate to the project directory**:
   ```bash
   cd "C:\Users\USER\Web development\Photobooth project"
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

### Running the Application

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

3. **Allow camera permissions** when prompted by your browser

## 📖 How to Use

### Basic Photo Capture

1. **Allow camera access** when the page loads
2. **Position yourself** in front of the camera
3. **Click "Capture"** to take an immediate photo, or:
4. **Enter a timer value** (in seconds) and click "Capture" for a countdown

### Advanced Features

- **Timer**: Set a countdown delay before photo capture
- **Download**: Click the "Save & Download" button under each photo to:
  - Automatically save to the `gallery/` folder
  - Download the image to your downloads folder

### Photo Storage

- Photos are automatically saved to: `gallery/photobooth_[timestamp].png`
- Each photo gets a unique timestamp filename
- Gallery folder is created automatically if it doesn't exist

## 🏗️ Project Structure

```
photobooth-project/
├── index.html          # Main HTML interface
├── style.css           # Styling and layout
├── script.js           # Frontend JavaScript logic
├── server.js           # Node.js/Express backend server
├── package.json        # Project dependencies and scripts
├── gallery/            # Auto-created folder for saved photos
└── node_modules/       # Installed dependencies
```

## 🛠️ Technologies Used

### Frontend
- **HTML5**: Semantic markup and video element
- **CSS3**: Modern styling with gradients, flexbox, and animations
- **JavaScript (ES6+)**: Camera API, async/await

### Backend
- **Node.js**: JavaScript runtime
- **Express.js**: Web framework for the server
- **CORS**: Cross-origin resource sharing
- **File System**: Local file saving

### APIs Used
- **MediaDevices API**: Camera access
- **Canvas API**: Image processing and export
- **Fetch API**: Server communication

## 🔧 Configuration

### Server Settings

The server runs on `http://localhost:3000` by default. You can modify the port in `server.js`:

```javascript
const PORT = 3000; // Change this to your preferred port
```

### Gallery Path

Photos are saved to the `gallery/` folder relative to the project root. The path is defined in `server.js`:

```javascript
const galleryPath = path.join(__dirname, "gallery");
```

## 🐛 Troubleshooting

### Camera Not Working
- **Check permissions**: Ensure you've allowed camera access in your browser
- **HTTPS requirement**: Some browsers require HTTPS for camera access
- **Camera availability**: Make sure no other applications are using the camera

### Server Not Starting
- **Port in use**: Try changing the port number in `server.js`
- **Dependencies**: Run `npm install` to ensure all packages are installed
- **Node version**: Ensure you're using Node.js version 14 or higher

### Photos Not Saving
- **Server running**: Make sure the backend server is running (`npm start`)
- **Permissions**: Ensure the application has write permissions to the gallery folder
- **Console errors**: Check browser console and terminal for error messages

## 📝 Development

### Adding New Features

1. **Frontend changes**: Modify `script.js` for new functionality
2. **Styling updates**: Edit `style.css` for visual changes
3. **Backend features**: Update `server.js` for server-side logic

### Building for Production

The application is designed for local use. For production deployment:

1. Set up a proper web server (nginx, Apache)
2. Configure HTTPS certificates
3. Set up proper file permissions
4. Consider using a database for photo management

## 📄 License

This project is licensed under the ISC License.

## 🤝 Contributing

Feel free to fork this project and submit pull requests with improvements!

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are met
3. Check browser console for error messages
4. Ensure the server is running and accessible

---

**Happy photographing! 📸**
