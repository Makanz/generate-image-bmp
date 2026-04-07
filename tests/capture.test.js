const fs = require('fs').promises;
const path = require('path');
const os = require('os');

jest.mock('../src/services/screenshot', () => ({
    createScreenshotProvider: jest.fn().mockReturnValue({
        capture: jest.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    })
}));

jest.mock('sharp', () => {
    return jest.fn().mockImplementation(() => ({
        greyscale: jest.fn().mockReturnThis(),
        threshold: jest.fn().mockReturnThis(),
        raw: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue({
            data: Buffer.alloc(800 * 480),
            info: { width: 800, height: 480 }
        })
    }));
});

jest.mock('../src/image/bmp-writer', () => ({
    writeBmp: jest.fn().mockResolvedValue(undefined)
}));

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

    async function createTestBmp(filePath, width, height, drawFn) {
        const pixels = Buffer.alloc(width * height, 0);
        drawFn(pixels, width, height);
        
        const rowBytes = Math.ceil(width / 8);
        const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
        const pixelDataSize = paddedRowBytes * height;
        const fileSize = 14 + 40 + 8 + pixelDataSize;
        
        const buf = Buffer.alloc(fileSize, 0);
        buf.write('BM', 0);
        buf.writeUInt32LE(fileSize, 2);
        buf.writeUInt32LE(62, 10);
        buf.writeUInt32LE(40, 14);
        buf.writeInt32LE(width, 18);
        buf.writeInt32LE(-height, 22);
        buf.writeUInt16LE(1, 26);
        buf.writeUInt16LE(1, 28);
        buf.writeUInt32LE(0, 30);
        buf.writeUInt32LE(pixelDataSize, 34);
        buf.writeInt32LE(2835, 38);
        buf.writeInt32LE(2835, 42);
        buf.writeUInt32LE(2, 46);
        buf.writeUInt32LE(2, 50);
        buf.writeUInt32LE(0x00000000, 54);
        buf.writeUInt32LE(0x00FFFFFF, 58);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const gray = pixels[y * width + x];
                if (gray >= 128) {
                    const byteIndex = Math.floor(x / 8);
                    const bitIndex = 7 - (x % 8);
                    buf[62 + y * paddedRowBytes + byteIndex] |= (1 << bitIndex);
                }
            }
        }
        
        await fs.writeFile(filePath, buf);
    }

    test('returns empty array when no changes', async () => {
        const currentBmp = path.join(tempDir, 'current.bmp');
        const previousBmp = path.join(tempDir, 'previous.bmp');

        await createTestBmp(currentBmp, 800, 480, () => {});
        await createTestBmp(previousBmp, 800, 480, () => {});

        const changes = await detectChanges(currentBmp, previousBmp);
        expect(changes).toEqual([]);
    });

    test('returns change regions when images differ', async () => {
        const currentBmp = path.join(tempDir, 'current.bmp');
        const previousBmp = path.join(tempDir, 'previous.bmp');

        await createTestBmp(currentBmp, 800, 480, (pixels) => {
            pixels[100] = 255;
        });
        await createTestBmp(previousBmp, 800, 480, (pixels) => {});

        const changes = await detectChanges(currentBmp, previousBmp);
        expect(changes.length).toBeGreaterThan(0);
    });

    test('handles missing previous file', async () => {
        const currentBmp = path.join(tempDir, 'current.bmp');
        const previousBmp = path.join(tempDir, 'previous.bmp');

        await createTestBmp(currentBmp, 800, 480, () => {});

        await expect(detectChanges(currentBmp, previousBmp)).rejects.toThrow();
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

describe('capture.js - concurrent generation guard', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        jest.resetModules();
    });

    test('concurrent calls coalesce into single generation', async () => {
        const { generateImage, getInFlightGeneration } = require('../capture.ts');
        
        expect(getInFlightGeneration()).toBeNull();
        
        const promise1 = generateImage({ outputBmp: 'output/test1.bmp' });
        expect(getInFlightGeneration()).not.toBeNull();
        
        const promise2 = generateImage({ outputBmp: 'output/test2.bmp' });
        expect(getInFlightGeneration()).not.toBeNull();
        
        await promise1;
        
        expect(promise1).resolves.toEqual({ bmp: expect.any(String) });
        expect(promise2).resolves.toEqual({ bmp: expect.any(String) });
    });

    test('after generation completes, new call starts new generation', async () => {
        const { generateImage, getInFlightGeneration } = require('../capture.ts');
        
        const promise1 = generateImage({ outputBmp: 'output/test.bmp' });
        expect(getInFlightGeneration()).not.toBeNull();
        await promise1;
        
        expect(getInFlightGeneration()).toBeNull();
        
        const promise2 = generateImage({ outputBmp: 'output/test.bmp' });
        expect(getInFlightGeneration()).not.toBeNull();
        
        await promise2;
        expect(getInFlightGeneration()).toBeNull();
    });

    test('getInFlightGeneration() reflects generation state', async () => {
        const { generateImage, getInFlightGeneration } = require('../capture.ts');
        
        expect(getInFlightGeneration()).toBeNull();
        
        const promise = generateImage({ outputBmp: 'output/test.bmp' });
        expect(getInFlightGeneration()).not.toBeNull();
        
        await promise;
        
        expect(getInFlightGeneration()).toBeNull();
    });
});
