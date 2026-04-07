import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { writeBmp } from './src/image/bmp-writer';
import { createScreenshotProvider } from './src/services/screenshot';
import { getChanges as getChangesImpl, mergeRegions as mergeRegionsImpl, detectChanges as detectChangesImpl, computeChecksum as computeChecksumImpl, ChangeRegion, ChangesResult } from './src/services/change-detection';
import { WIDTH, HEIGHT, GREYSCALE_THRESHOLD } from './src/utils/constants';
import { getAppRoot } from './src/utils/path';

const APP_ROOT = getAppRoot();
const OUTPUT_DIR = path.join(APP_ROOT, 'output');
const PORT = process.env.PORT || 5173;
const BASE_URL = process.env.CAPTURE_URL || `http://localhost:${PORT}`;

interface GenerateImageOptions {
    outputBmp?: string;
}

let inFlightGeneration: Promise<{ bmp: string }> | null = null;
let currentGenerationSource: Promise<{ bmp: string }> | null = null;

export function isGenerating(): boolean {
    return inFlightGeneration !== null;
}

export function getInFlightGeneration(): Promise<{ bmp: string }> | null {
    return inFlightGeneration;
}

async function _generateImage(options: GenerateImageOptions = {}): Promise<{ bmp: string }> {
    const {
        outputBmp = path.join(OUTPUT_DIR, 'dashboard.bmp')
    } = options;

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const previousBmp = path.join(OUTPUT_DIR, 'dashboard.previous.bmp');
    const currentBmpExists = await fileExists(outputBmp);
    if (currentBmpExists) {
        await fs.copyFile(outputBmp, previousBmp);
        console.log(`[capture] Previous image saved: ${previousBmp}`);
    }

    const url = process.env.CAPTURE_URL || `${BASE_URL}/`;
    console.log(`[capture] Capturing ${url}...`);

    const provider = createScreenshotProvider();
    const pngBuffer = await provider.capture(url, WIDTH, HEIGHT);

    console.log(`[capture] Screenshot captured (${pngBuffer.length} bytes)`);

    const greyscaleResult = await sharp(pngBuffer)
        .greyscale()
        .threshold(GREYSCALE_THRESHOLD)
        .raw()
        .toBuffer({ resolveWithObject: true });

    await writeBmp(greyscaleResult.info.width, greyscaleResult.info.height, greyscaleResult.data, outputBmp);

    console.log(`[capture] BMP saved: ${outputBmp}`);

    return { bmp: outputBmp };
}

async function generateImage(options: GenerateImageOptions = {}): Promise<{ bmp: string }> {
    if (inFlightGeneration) {
        console.log('[capture] Generation already in progress, awaiting existing run...');
        return inFlightGeneration;
    }

    currentGenerationSource = _generateImage(options);
    const wrapped = currentGenerationSource.finally(() => {
        inFlightGeneration = null;
        currentGenerationSource = null;
    });
    inFlightGeneration = wrapped;

    return inFlightGeneration;
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
    console.log('Done: output/dashboard.bmp');
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

export { generateImage, getChanges, mergeRegions, detectChanges, computeChecksum };
export type { ChangeRegion, ChangesResult, GenerateImageOptions };
