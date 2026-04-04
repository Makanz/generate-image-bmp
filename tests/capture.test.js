const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { computeChecksum, mergeRegions, detectChanges } = require('../capture.ts');

describe('capture.js - computeChecksum', () => {
    let tempFile;

    beforeEach(async () => {
        tempFile = path.join(os.tmpdir(), `checksum-test-${Date.now()}.txt`);
    });

    afterEach(async () => {
        try {
            await fs.unlink(tempFile);
        } catch {
        }
    });

    test('returns null for non-existent file', async () => {
        const result = await computeChecksum('/nonexistent/file.png');
        expect(result).toBeNull();
    });

    test('returns sha256 checksum for existing file', async () => {
        await fs.writeFile(tempFile, 'test content');
        const result = await computeChecksum(tempFile);
        expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    test('different content produces different checksums', async () => {
        const file1 = path.join(os.tmpdir(), `checksum-1-${Date.now()}.txt`);
        const file2 = path.join(os.tmpdir(), `checksum-2-${Date.now()}.txt`);

        await fs.writeFile(file1, 'content 1');
        await fs.writeFile(file2, 'content 2');

        const checksum1 = await computeChecksum(file1);
        const checksum2 = await computeChecksum(file2);

        expect(checksum1).not.toBe(checksum2);

        await fs.unlink(file1);
        await fs.unlink(file2);
    });

    test('same content produces same checksum', async () => {
        await fs.writeFile(tempFile, 'identical content');
        const checksum1 = await computeChecksum(tempFile);
        const checksum2 = await computeChecksum(tempFile);
        expect(checksum1).toBe(checksum2);
    });
});

describe('capture.js - detectChanges', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = path.join(os.tmpdir(), `detect-changes-test-${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
        }
    });

    async function createTestPng(filePath, width, height, drawFn) {
        const sharp = require('sharp');
        const pixels = Buffer.alloc(width * height, 0);
        drawFn(pixels, width, height);
        const rawBuffer = await sharp(pixels, {
            raw: { width, height, channels: 1 }
        }).png().toBuffer();
        await fs.writeFile(filePath, rawBuffer);
    }

    test('returns empty array when no changes', async () => {
        const currentPng = path.join(tempDir, 'current.png');
        const previousPng = path.join(tempDir, 'previous.png');

        await createTestPng(currentPng, 800, 480, () => {});
        await createTestPng(previousPng, 800, 480, () => {});

        const changes = await detectChanges(currentPng, previousPng);
        expect(changes).toEqual([]);
    });

    test('returns change regions when images differ', async () => {
        const currentPng = path.join(tempDir, 'current.png');
        const previousPng = path.join(tempDir, 'previous.png');

        await createTestPng(currentPng, 800, 480, (pixels) => {
            pixels[100] = 255;
        });
        await createTestPng(previousPng, 800, 480, (pixels) => {});

        const changes = await detectChanges(currentPng, previousPng);
        expect(changes.length).toBeGreaterThan(0);
    });

    test('handles missing previous file', async () => {
        const currentPng = path.join(tempDir, 'current.png');
        const previousPng = path.join(tempDir, 'previous.png');

        await createTestPng(currentPng, 800, 480, () => {});

        await expect(detectChanges(currentPng, previousPng)).rejects.toThrow();
    });
});

describe('capture.js - mergeRegions edge cases', () => {
    test('merges adjacent regions', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 10, y: 0, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(1);
        expect(merged[0].width).toBe(20);
    });

    test('merges regions that touch at corners', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 10, y: 10, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(1);
    });

    test('preserves separate regions when far apart', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 500, y: 500, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(2);
    });

    test('merges chain of overlapping regions', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 8, y: 0, width: 10, height: 10 },
            { x: 16, y: 0, width: 10, height: 10 },
            { x: 24, y: 0, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(1);
        expect(merged[0].width).toBe(34);
    });

    test('handles zero distance threshold', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 9, y: 0, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 0);
        expect(merged).toHaveLength(1);
    });

    test('single pixel regions', () => {
        const regions = [
            { x: 5, y: 5, width: 1, height: 1 },
            { x: 6, y: 5, width: 1, height: 1 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(1);
        expect(merged[0].x).toBe(5);
        expect(merged[0].width).toBe(2);
    });
});
