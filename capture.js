const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const playwright = require('playwright');

const WIDTH = 800;
const HEIGHT = 480;
const OUTPUT_DIR = path.join(__dirname, 'output');
const PORT = process.env.PORT || 5173;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

async function screenshotWithBrowserless(pageUrl) {
    const browserlessUrl = process.env.BROWSERLESS_URL;
    const token = process.env.BROWSERLESS_TOKEN;

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Basic ${Buffer.from(token).toString('base64')}`;
    }

    const body = {
        url: pageUrl,
        options: { type: 'png', fullPage: false },
        viewport: { width: WIDTH, height: HEIGHT },
        gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 }
    };

    console.log(`[capture] Using Browserless REST API at ${browserlessUrl}/screenshot`);
    const response = await axios.post(`${browserlessUrl}/screenshot`, body, {
        headers,
        responseType: 'arraybuffer',
        timeout: 45000
    });

    return Buffer.from(response.data);
}

async function screenshotWithPlaywright(pageUrl) {
    console.log('[capture] Launching local Chromium...');
    const browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });

    console.log(`[capture] Loading ${pageUrl}...`);
    try {
        const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!response || !response.ok()) {
            throw new Error(`Server returned ${response ? response.status() : 'no response'}`);
        }
        await page.waitForFunction(
            () => document.body.dataset.loaded === 'true',
            { timeout: 10000 }
        ).catch(() => console.warn('[capture] Data load timeout, proceeding with current content'));
    } catch (err) {
        console.error('[capture] Failed to load page:', err.message);
        await browser.close();
        throw err;
    }

    console.log('[capture] Taking screenshot...');
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();
    return pngBuffer;
}

async function writeBmp1bit(width, height, pixelsGray, outputPath) {
    const rowBytes = Math.ceil(width / 32) * 4;
    const pixelDataSize = rowBytes * height;
    const fileHeaderSize = 14;
    const dibHeaderSize = 40;
    const colorTableSize = 8;
    const fileSize = fileHeaderSize + dibHeaderSize + colorTableSize + pixelDataSize;
    const pixelOffset = fileHeaderSize + dibHeaderSize + colorTableSize;

    const buf = Buffer.alloc(fileSize, 0);
    let pos = 0;

    buf.write('BM', pos); pos += 2;
    buf.writeUInt32LE(fileSize, pos); pos += 4;
    buf.writeUInt16LE(0, pos); pos += 2;
    buf.writeUInt16LE(0, pos); pos += 2;
    buf.writeUInt32LE(pixelOffset, pos); pos += 4;

    buf.writeUInt32LE(dibHeaderSize, pos); pos += 4;
    buf.writeInt32LE(width, pos); pos += 4;
    buf.writeInt32LE(-height, pos); pos += 4;
    buf.writeUInt16LE(1, pos); pos += 2;
    buf.writeUInt16LE(1, pos); pos += 2;
    buf.writeUInt32LE(0, pos); pos += 4;
    buf.writeUInt32LE(pixelDataSize, pos); pos += 4;
    buf.writeInt32LE(2835, pos); pos += 4;
    buf.writeInt32LE(2835, pos); pos += 4;
    buf.writeUInt32LE(2, pos); pos += 4;
    buf.writeUInt32LE(2, pos); pos += 4;

    buf.writeUInt32LE(0x00000000, pos); pos += 4;
    buf.writeUInt32LE(0x00FFFFFF, pos); pos += 4;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < rowBytes; x++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const px = x * 8 + bit;
                if (px < width) {
                    const gray = pixelsGray[y * width + px];
                    if (gray >= 128) byte |= (0x80 >> bit);
                }
            }
            buf[pos + y * rowBytes + x] = byte;
        }
    }

    await fs.writeFile(outputPath, buf);
}

async function generateImage(options = {}) {
    const {
        outputPng = path.join(OUTPUT_DIR, 'dashboard.png'),
        outputBmp = path.join(OUTPUT_DIR, 'dashboard.bmp')
    } = options;

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const url = process.env.CAPTURE_URL || `${BASE_URL}/`;
    console.log(`[capture] Capturing ${url}...`);

    let pngBuffer;
    if (process.env.BROWSERLESS_URL) {
        pngBuffer = await screenshotWithBrowserless(url);
    } else {
        pngBuffer = await screenshotWithPlaywright(url);
    }

    console.log(`[capture] PNG captured (${pngBuffer.length} bytes)`);

    const { data: rawPixels, info } = await sharp(pngBuffer)
        .greyscale()
        .threshold(128)
        .raw()
        .toBuffer({ resolveWithObject: true });

    const [pngOut] = await Promise.all([
        sharp(pngBuffer).toFile(outputPng),
        writeBmp1bit(info.width, info.height, rawPixels, outputBmp)
    ]);

    console.log(`[capture] PNG saved: ${outputPng}`);
    console.log(`[capture] BMP saved: ${outputBmp}`);

    return { png: outputPng, bmp: outputBmp };
}

async function main() {
    console.log('Generating dashboard image...');
    await generateImage();
    console.log('Done: output/dashboard.png, output/dashboard.bmp');
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

module.exports = { generateImage };
