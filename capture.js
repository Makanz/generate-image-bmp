const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const playwright = require('playwright');
const crypto = require('crypto');

const WIDTH = 800;
const HEIGHT = 480;
const OUTPUT_DIR = path.join(__dirname, 'output');
const PORT = process.env.PORT || 5173;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const MERGE_DISTANCE = 10;

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

    const previousPng = path.join(OUTPUT_DIR, 'dashboard.previous.png');
    const currentPngExists = await fs.access(outputPng).then(() => true).catch(() => false);
    if (currentPngExists) {
        await fs.copyFile(outputPng, previousPng);
        console.log(`[capture] Previous image saved: ${previousPng}`);
    }

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

async function computeChecksum(filePath) {
    try {
        const buffer = await fs.readFile(filePath);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        return `sha256:${hash}`;
    } catch (err) {
        return null;
    }
}

async function detectChanges(currentPath, previousPath) {
    const width = WIDTH;
    const height = HEIGHT;

    const currentImage = await sharp(currentPath)
        .resize(width, height)
        .greyscale()
        .threshold(128)
        .raw()
        .toBuffer();
    const previousImage = await sharp(previousPath)
        .resize(width, height)
        .greyscale()
        .threshold(128)
        .raw()
        .toBuffer();

    const changes = [];
    const visited = Buffer.alloc(width * height, 0);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (visited[idx]) continue;

            const currentByte = currentImage[idx];
            const previousByte = previousImage[idx];

            if (currentByte !== previousByte) {
                let minX = x, maxX = x, minY = y, maxY = y;
                const stack = [[x, y]];

                while (stack.length > 0) {
                    const [cx, cy] = stack.pop();
                    const cIdx = cy * width + cx;

                    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
                    if (visited[cIdx]) continue;

                    const cCur = currentImage[cIdx];
                    const cPrev = previousImage[cIdx];
                    if (cCur === cPrev) continue;

                    visited[cIdx] = 1;

                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    stack.push([cx + 1, cy]);
                    stack.push([cx - 1, cy]);
                    stack.push([cx, cy + 1]);
                    stack.push([cx, cy - 1]);
                }

                changes.push({
                    x: minX,
                    y: minY,
                    width: maxX - minX + 1,
                    height: maxY - minY + 1
                });
            }
        }
    }

    const mergedChanges = mergeRegions(changes, MERGE_DISTANCE);

    return mergedChanges;
}

function mergeRegions(regions, distance) {
    if (regions.length <= 1) return regions;

    const merged = regions.map(r => ({
        x: r.x,
        y: r.y,
        maxX: r.x + r.width - 1,
        maxY: r.y + r.height - 1
    }));

    const used = new Set();
    let changed = true;
    while (changed) {
        changed = false;

        for (let i = 0; i < merged.length; i++) {
            if (used.has(i)) continue;

            for (let j = i + 1; j < merged.length; j++) {
                if (used.has(j)) continue;

                const r1 = merged[i];
                const r2 = merged[j];

                const horizontalOverlap = r1.x - distance <= r2.maxX + distance &&
                                          r1.maxX + distance >= r2.x - distance;
                const verticalOverlap = r1.y - distance <= r2.maxY + distance &&
                                        r1.maxY + distance >= r2.y - distance;

                if (horizontalOverlap && verticalOverlap) {
                    r1.x = Math.min(r1.x, r2.x);
                    r1.y = Math.min(r1.y, r2.y);
                    r1.maxX = Math.max(r1.maxX, r2.maxX);
                    r1.maxY = Math.max(r1.maxY, r2.maxY);
                    used.add(j);
                    changed = true;
                }
            }
        }
    }

    const result = [];
    for (let i = 0; i < merged.length; i++) {
        if (!used.has(i)) {
            result.push({
                x: merged[i].x,
                y: merged[i].y,
                width: merged[i].maxX - merged[i].x + 1,
                height: merged[i].maxY - merged[i].y + 1
            });
        }
    }
    return result;
}

async function getChanges() {
    const currentPath = path.join(OUTPUT_DIR, 'dashboard.png');
    const previousPath = path.join(OUTPUT_DIR, 'dashboard.previous.png');

    const currentExists = await fs.access(currentPath).then(() => true).catch(() => false);
    const previousExists = await fs.access(previousPath).then(() => true).catch(() => false);

    if (!currentExists) {
        return { changes: [], currentChecksum: null, previousChecksum: null, timestamp: new Date().toISOString() };
    }

    const currentChecksum = await computeChecksum(currentPath);
    const previousChecksum = previousExists ? await computeChecksum(previousPath) : null;

    if (!previousExists) {
        return { changes: [], currentChecksum, previousChecksum, timestamp: new Date().toISOString() };
    }

    const changes = await detectChanges(currentPath, previousPath);

    return {
        changes,
        currentChecksum,
        previousChecksum,
        timestamp: new Date().toISOString()
    };
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

module.exports = { generateImage, getChanges };
