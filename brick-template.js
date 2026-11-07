// Brick photostrip template — "Kid's AWKND"
// Draws a toy-brick style strip (4 photo windows) with a custom bottom footer image.
(function () {
    const BASE_W = 400;
    const BASE_H = 1240;
    const SCALE = 3; // output is 1200 x 3720

    const INK = "#3B2A1A";
    const NAVY = "#1B2A49";
    const CREAM = "#FFF3D6";
    const BASE_YELLOW = "rgb(188, 166, 208)";
    const BRICK_COLORS = ["#D7261E", "#F28C28", "#F9C80E", "#2E9E4F", "#1F6FD0"];
    const FRAME_COLORS = ["#D7261E", "#1F6FD0", "#2E9E4F", "#F28C28"];

    const TOP_BAND = 64;
    const WINDOW = { x: 40, w: 320, h: 224, gap: 28, border: 10, radius: 8 };
    const WINDOWS_TOP = TOP_BAND + 28;
    const LABEL_TOP = 1100;
    const LABEL_H = 140;

    // Provide the path or Data URL of your custom bottom image here
    const FOOTER_IMAGE_SRC = "path/to/your/image.png"; 

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    function drawStud(ctx, cx, cy, light, ring) {
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = light;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = ring;
        ctx.stroke();
    }

    function drawStudGrid(ctx, x, y, w, h, tileW, tileH, light, ring) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        for (let cy = y + tileH / 2; cy < y + h + tileH; cy += tileH) {
            for (let cx = x + tileW / 2; cx < x + w + tileW; cx += tileW) {
                drawStud(ctx, cx, cy, light, ring);
            }
        }
        ctx.restore();
    }

    function drawBrickRow(ctx, y, h, studTileH) {
        const brickW = BASE_W / BRICK_COLORS.length;
        BRICK_COLORS.forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.fillRect(i * brickW, y, brickW, h);
        });
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        for (let i = 1; i < BRICK_COLORS.length; i++) {
            ctx.fillRect(i * brickW - 1, y, 2, h);
        }
        drawStudGrid(ctx, 0, y, BASE_W, h, 40, studTileH, "rgba(255,255,255,0.3)", "rgba(0,0,0,0.22)");
    }

    function drawCover(ctx, img, x, y, w, h) {
        const targetAspect = w / h;
        const srcAspect = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcAspect > targetAspect) {
            sw = img.height * targetAspect;
            sx = (img.width - sw) / 2;
        } else {
            sh = img.width / targetAspect;
            sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }

    function drawWindows(ctx, images) {
        for (let i = 0; i < 4; i++) {
            const x = WINDOW.x;
            const y = WINDOWS_TOP + i * (WINDOW.h + WINDOW.gap);
            const b = WINDOW.border;

            // brick-style drop edge
            roundRectPath(ctx, x, y + 6, WINDOW.w, WINDOW.h, WINDOW.radius);
            ctx.fillStyle = "rgba(0,0,0,0.22)";
            ctx.fill();

            // frame
            roundRectPath(ctx, x, y, WINDOW.w, WINDOW.h, WINDOW.radius);
            ctx.fillStyle = FRAME_COLORS[i];
            ctx.fill();

            // photo
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + b, y + b, WINDOW.w - b * 2, WINDOW.h - b * 2);
            ctx.clip();
            if (images[i]) {
                drawCover(ctx, images[i], x + b, y + b, WINDOW.w - b * 2, WINDOW.h - b * 2);
            } else {
                ctx.fillStyle = "#BFE6FF";
                ctx.fillRect(x + b, y + b, WINDOW.w - b * 2, WINDOW.h - b * 2);
            }
            ctx.restore();
        }
    }

    function drawFooterImage(ctx, footerImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, LABEL_TOP, BASE_W, LABEL_H);
        ctx.clip();
        drawCover(ctx, footerImg, 0, LABEL_TOP, BASE_W, LABEL_H);
        ctx.restore();
    }

    async function createBrickStrip(imageDataArray, customFooterSrc) {
        const photosPromise = Promise.all(imageDataArray.slice(0, 4).map(loadImage));
        const footerPromise = loadImage(customFooterSrc || FOOTER_IMAGE_SRC);

        const [images, footerImg] = await Promise.all([photosPromise, footerPromise]);

        const canvas = document.createElement("canvas");
        canvas.width = BASE_W * SCALE;
        canvas.height = BASE_H * SCALE;
        const ctx = canvas.getContext("2d");
        ctx.scale(SCALE, SCALE);

        // base plate with studs
        ctx.fillStyle = BASE_YELLOW;
        ctx.fillRect(0, 0, BASE_W, BASE_H);
        drawStudGrid(ctx, 0, 0, BASE_W, BASE_H, 40, 28, "rgba(255,255,255,0.45)", "rgba(0,0,0,0.16)");

        drawBrickRow(ctx, 0, TOP_BAND, 32);
        drawWindows(ctx, images);
        drawFooterImage(ctx, footerImg);

        return canvas.toDataURL("image/png");
    }

    // Aspect ratio (width / height) of one photo inside a window
    createBrickStrip.photoAspect = (WINDOW.w - WINDOW.border * 2) / (WINDOW.h - WINDOW.border * 2);

    window.createBrickStrip = createBrickStrip;
})();