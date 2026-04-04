import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { writeBmp } from './src/image/bmp-writer';
import { createScreenshotProvider } from './src/services/screenshot';
import { processToGreyscale } from './src/services/image-processing';
import { getChanges as getChangesImpl, mergeRegions as mergeRegionsImpl, detectChanges as detectChangesImpl, computeChecksum as computeChecksumImpl, ChangeRegion, ChangesResult } from './src/services/change-detection';
import { WIDTH, HEIGHT } from './src/utils/constants';
import { getAppRoot } from './src/utils/path';

const APP_ROOT = getAppRoot();
const OUTPUT_DIR = path.join(APP_ROOT, 'output');
const PORT = process.env.PORT || 5173;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

interface GenerateImageOptions {
    outputPng?: string;
    outputBmp?: string;
}

async function generateImage(options: GenerateImageOptions = {}): Promise<{ png: string; bmp: string }> {
    const {
        outputPng = path.join(OUTPUT_DIR, 'dashboard.png'),
        outputBmp = path.join(OUTPUT_DIR, 'dashboard.bmp')
    } = options;

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const previousPng = path.join(OUTPUT_DIR, 'dashboard.previous.png');
    const currentPngExists = await fileExists(outputPng);
    if (currentPngExists) {
        await fs.copyFile(outputPng, previousPng);
        console.log(`[capture] Previous image saved: ${previousPng}`);
    }

    const url = process.env.CAPTURE_URL || `${BASE_URL}/`;
    console.log(`[capture] Capturing ${url}...`);

    const provider = createScreenshotProvider();
    const pngBuffer = await provider.capture(url, WIDTH, HEIGHT);

    console.log(`[capture] PNG captured (${pngBuffer.length} bytes)`);

    const result = await processToGreyscale(pngBuffer, { resolveWithObject: true });
    const typedResult = result as { data: Buffer; info: sharp.OutputInfo };

    await Promise.all([
        sharp(pngBuffer).toFile(outputPng),
        writeBmp(typedResult.info.width, typedResult.info.height, typedResult.data, outputBmp)
    ]);

    console.log(`[capture] PNG saved: ${outputPng}`);
    console.log(`[capture] BMP saved: ${outputBmp}`);

    return { png: outputPng, bmp: outputBmp };
}

async function getChanges(): Promise<ChangesResult> {
    return getChangesImpl(OUTPUT_DIR);
}

function mergeRegions(regions: ChangeRegion[], distance: number): ChangeRegion[] {
    return mergeRegionsImpl(regions, distance);
}

async function detectChanges(currentPath: string, previousPath: string): Promise<ChangeRegion[]> {
    return detectChangesImpl(currentPath, previousPath);
}

async function computeChecksum(filePath: string): Promise<string | null> {
    return computeChecksumImpl(filePath);
}

async function fileExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true).catch(() => false);
}

async function main(): Promise<void> {
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

export { generateImage, getChanges, mergeRegions, detectChanges, computeChecksum };
export type { ChangeRegion, ChangesResult, GenerateImageOptions };
