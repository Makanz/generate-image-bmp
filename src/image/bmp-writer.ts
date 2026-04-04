import * as fs from 'fs/promises';
import {
    DPI_PIXELS_PER_METER,
    BITS_PER_DWORD,
    COLOR_TABLE_ENTRIES,
    COLOR_BLACK,
    COLOR_WHITE,
    GREYSCALE_THRESHOLD
} from '../utils/constants';

const FILE_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 40;
const COLOR_TABLE_ENTRY_SIZE = 4;
const COLOR_TABLE_SIZE = COLOR_TABLE_ENTRIES * COLOR_TABLE_ENTRY_SIZE;

async function writeBmp(width: number, height: number, pixelsGray: Buffer, outputPath: string): Promise<void> {
    const rowBytes = Math.ceil(width / BITS_PER_DWORD) * 4;
    const pixelDataSize = rowBytes * height;
    const fileSize = FILE_HEADER_SIZE + DIB_HEADER_SIZE + COLOR_TABLE_SIZE + pixelDataSize;
    const pixelOffset = FILE_HEADER_SIZE + DIB_HEADER_SIZE + COLOR_TABLE_SIZE;

    const buf = Buffer.alloc(fileSize, 0);
    let pos = 0;

    buf.write('BM', pos); pos += 2;
    buf.writeUInt32LE(fileSize, pos); pos += 4;
    buf.writeUInt16LE(0, pos); pos += 2;
    buf.writeUInt16LE(0, pos); pos += 2;
    buf.writeUInt32LE(pixelOffset, pos); pos += 4;

    buf.writeUInt32LE(DIB_HEADER_SIZE, pos); pos += 4;
    buf.writeInt32LE(width, pos); pos += 4;
    buf.writeInt32LE(-height, pos); pos += 4;
    buf.writeUInt16LE(1, pos); pos += 2;
    buf.writeUInt16LE(1, pos); pos += 2;
    buf.writeUInt32LE(0, pos); pos += 4;
    buf.writeUInt32LE(pixelDataSize, pos); pos += 4;
    buf.writeInt32LE(DPI_PIXELS_PER_METER, pos); pos += 4;
    buf.writeInt32LE(DPI_PIXELS_PER_METER, pos); pos += 4;
    buf.writeUInt32LE(COLOR_TABLE_ENTRIES, pos); pos += 4;
    buf.writeUInt32LE(COLOR_TABLE_ENTRIES, pos); pos += 4;

    buf.writeUInt32LE(COLOR_BLACK, pos); pos += 4;
    buf.writeUInt32LE(COLOR_WHITE, pos); pos += 4;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < rowBytes; x++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const px = x * 8 + bit;
                if (px < width) {
                    const gray = pixelsGray[y * width + px];
                    if (gray >= GREYSCALE_THRESHOLD) byte |= (0x80 >> bit);
                }
            }
            buf[pos + y * rowBytes + x] = byte;
        }
    }

    await fs.writeFile(outputPath, buf);
}

export { writeBmp };
