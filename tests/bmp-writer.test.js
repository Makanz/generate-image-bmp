const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { writeBmp } = require('../src/image/bmp-writer');

const FILE_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 40;
const COLOR_TABLE_SIZE = 8;

async function writeBmpToTemp(width, height, pixels) {
    const tmpFile = path.join(os.tmpdir(), `bmp-test-${Date.now()}.bmp`);
    await writeBmp(width, height, pixels, tmpFile);
    const buf = await fs.readFile(tmpFile);
    await fs.unlink(tmpFile);
    return buf;
}

describe('writeBmp', () => {
    test('skriver BM-signatur i de två första bytes', async () => {
        const buf = await writeBmpToTemp(8, 1, Buffer.alloc(8, 255));
        expect(buf.toString('ascii', 0, 2)).toBe('BM');
    });

    test('filstorlek i header matchar faktisk buffert', async () => {
        const width = 8;
        const height = 2;
        const buf = await writeBmpToTemp(width, height, Buffer.alloc(width * height, 255));
        const reportedSize = buf.readUInt32LE(2);
        expect(reportedSize).toBe(buf.length);
    });

    test('pixel-offset pekar på rätt plats', async () => {
        const buf = await writeBmpToTemp(8, 1, Buffer.alloc(8, 255));
        const pixelOffset = buf.readUInt32LE(10);
        expect(pixelOffset).toBe(FILE_HEADER_SIZE + DIB_HEADER_SIZE + COLOR_TABLE_SIZE);
    });

    test('DIB-header rapporterar rätt bredd och höjd', async () => {
        const width = 16;
        const height = 4;
        const buf = await writeBmpToTemp(width, height, Buffer.alloc(width * height, 0));
        const reportedWidth = buf.readInt32LE(18);
        const reportedHeight = buf.readInt32LE(22);
        expect(reportedWidth).toBe(width);
        expect(reportedHeight).toBe(-height); // top-down BMP har negativ höjd
    });

    test('1 bpp anges i DIB-header', async () => {
        const buf = await writeBmpToTemp(8, 1, Buffer.alloc(8, 0));
        const bitsPerPixel = buf.readUInt16LE(28);
        expect(bitsPerPixel).toBe(1);
    });

    test('vita pixlar (>=128) kodas som 1-bitar', async () => {
        // 8 vita pixlar → en rad, en byte = 0xFF
        const pixels = Buffer.alloc(8, 255);
        const buf = await writeBmpToTemp(8, 1, pixels);
        const pixelOffset = buf.readUInt32LE(10);
        expect(buf[pixelOffset]).toBe(0xff);
    });

    test('svarta pixlar (<128) kodas som 0-bitar', async () => {
        // 8 svarta pixlar → en rad, en byte = 0x00
        const pixels = Buffer.alloc(8, 0);
        const buf = await writeBmpToTemp(8, 1, pixels);
        const pixelOffset = buf.readUInt32LE(10);
        expect(buf[pixelOffset]).toBe(0x00);
    });

    test('blandade pixlar kodas korrekt (vänster=MSB)', async () => {
        // Mönster: [255, 0, 255, 0, 255, 0, 255, 0] → 0b10101010 = 0xAA
        const pixels = Buffer.from([255, 0, 255, 0, 255, 0, 255, 0]);
        const buf = await writeBmpToTemp(8, 1, pixels);
        const pixelOffset = buf.readUInt32LE(10);
        expect(buf[pixelOffset]).toBe(0xaa);
    });

    test('färgtabell: index 0 = svart, index 1 = vitt', async () => {
        const buf = await writeBmpToTemp(8, 1, Buffer.alloc(8, 0));
        const colorTableOffset = FILE_HEADER_SIZE + DIB_HEADER_SIZE;
        const color0 = buf.readUInt32LE(colorTableOffset);
        const color1 = buf.readUInt32LE(colorTableOffset + 4);
        expect(color0).toBe(0x00000000); // svart
        expect(color1).toBe(0x00ffffff); // vitt
    });

    test('rader är 4-byte-justerade', async () => {
        // Bredd 1 → rowBytes ska vara 4
        const buf = await writeBmpToTemp(1, 2, Buffer.from([255, 0]));
        const rowBytes = Math.ceil(1 / 32) * 4;
        const pixelDataSize = rowBytes * 2;
        const expectedSize = FILE_HEADER_SIZE + DIB_HEADER_SIZE + COLOR_TABLE_SIZE + pixelDataSize;
        expect(buf.length).toBe(expectedSize);
    });
});
