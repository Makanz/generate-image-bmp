const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const playwright = require('playwright');

const WIDTH = 800;
const HEIGHT = 480;
const OUTPUT_DIR = path.join(__dirname, 'output');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

async function generateImage(options = {}) {
    const {
        outputPng = path.join(OUTPUT_DIR, 'dashboard.png'),
        outputBmp = path.join(OUTPUT_DIR, 'dashboard.bmp')
    } = options;

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    
    const url = process.env.CAPTURE_URL || `${BASE_URL}/`;
    console.log(`[capture] Loading ${url}...`);
    
    try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!response || !response.ok()) {
            throw new Error(`Server returned ${response ? response.status() : 'no response'}`);
        }
        
        const dataLoaded = await page.waitForFunction(
            () => document.body.dataset.loaded === 'true',
            { timeout: 10000 }
        ).then(() => true).catch(() => false);
        
        if (!dataLoaded) {
            console.warn('[capture] Data load timeout, proceeding with current content');
        }
    } catch (err) {
        console.error('[capture] Failed to load page:', err.message);
        console.error('[capture] Make sure the server is running: npm start');
        await browser.close();
        throw err;
    }

    console.log('[capture] Taking screenshot...');
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });

    await browser.close();
    console.log(`[capture] PNG captured (${pngBuffer.length} bytes)`);

    const [pngOut, bmpOut] = await Promise.all([
        sharp(pngBuffer).toFile(outputPng),
        sharp(pngBuffer)
            .greyscale()
            .threshold(128)
            .toFormat('bmp')
            .toFile(outputBmp)
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
