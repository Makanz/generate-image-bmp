const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
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

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

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
        await page.waitForTimeout(2000);
    } catch (err) {
        console.error('[capture] Failed to load page:', err.message);
        console.error('[capture] Make sure the server is running: npm start');
        await browser.close();
        throw err;
    }

    console.log('[capture] Taking screenshot...');
    await page.screenshot({ path: outputPng, type: 'png', fullPage: false });

    await browser.close();
    console.log(`[capture] PNG saved: ${outputPng}`);

    const pngBuffer = fs.readFileSync(outputPng);
    const bmpBuffer = await sharp(pngBuffer)
        .greyscale()
        .threshold(128)
        .toFormat('bmp')
        .toBuffer();

    fs.writeFileSync(outputBmp, bmpBuffer);
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
