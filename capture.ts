import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { writeBmp } from './src/image/bmp-writer';
import { createScreenshotProvider } from './src/services/screenshot';
import { getChanges as getChangesImpl, mergeRegions as mergeRegionsImpl, detectChanges as detectChangesImpl, computeChecksum as computeChecksumImpl, ChangeRegion, ChangesResult } from './src/services/change-detection';
import { WIDTH, HEIGHT, GREYSCALE_THRESHOLD } from './src/utils/constants';
import { createSnapshotFilename, publishSnapshot, pruneSnapshotFiles } from './src/utils/output-manifest';
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
    const outputDir = options.outputBmp
        ? path.dirname(path.resolve(options.outputBmp))
        : OUTPUT_DIR;

    await fs.mkdir(outputDir, { recursive: true });

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

    const generatedAt = new Date().toISOString();
    const snapshotBmp = path.join(outputDir, createSnapshotFilename(generatedAt));
    await writeBmp(greyscaleResult.info.width, greyscaleResult.info.height, greyscaleResult.data, snapshotBmp);

    const checksum = await computeChecksum(snapshotBmp);
    if (checksum === null) {
        throw new Error(`[capture] Failed to checksum generated BMP: ${snapshotBmp}`);
    }

    const manifest = await publishSnapshot(outputDir, {
        file: path.basename(snapshotBmp),
        generatedAt,
        checksum
    });

    const keepFiles = new Set<string>();
    if (manifest.current) {
        keepFiles.add(manifest.current.file);
    }
    if (manifest.previous) {
        keepFiles.add(manifest.previous.file);
    }
    await pruneSnapshotFiles(outputDir, keepFiles);

    console.log(`[capture] BMP snapshot published: ${snapshotBmp}`);

    return { bmp: snapshotBmp };
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

async function main(): Promise<void> {
    console.log('Generating dashboard image...');
    const result = await generateImage();
    console.log(`Done: published ${path.basename(result.bmp)}`);
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

export { generateImage, getChanges, mergeRegions, detectChanges, computeChecksum };
export type { ChangeRegion, ChangesResult, GenerateImageOptions };
