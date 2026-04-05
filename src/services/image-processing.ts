import sharp from 'sharp';
import fs from 'fs/promises';
import { WIDTH, HEIGHT } from '../utils/constants';

const FILE_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 40;
const COLOR_TABLE_SIZE = 8;

function parseBmpHeader(buffer: Buffer): { width: number; height: number; pixelOffset: number; rowBytes: number } {
    const pixelOffset = buffer.readUInt32LE(10);
    const width = buffer.readInt32LE(18);
    const height = buffer.readInt32LE(22);
    const absHeight = Math.abs(height);
    const rowBytes = Math.ceil(width / 8);
    const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
    
    return { width, height: absHeight, pixelOffset, rowBytes: paddedRowBytes };
}

function extractBmpPixelData(buffer: Buffer, width: number, height: number, pixelOffset: number, rowBytes: number): Buffer {
    const pixelData = Buffer.alloc(width * height);
    const topDown = height > 0;
    
    for (let y = 0; y < height; y++) {
        const srcRow = topDown ? y : (height - 1 - y);
        const srcOffset = pixelOffset + srcRow * rowBytes;
        const dstOffset = y * width;
        
        for (let x = 0; x < width; x++) {
            const byteIndex = Math.floor(x / 8);
            const bitIndex = 7 - (x % 8);
            const bit = (buffer[srcOffset + byteIndex] >> bitIndex) & 1;
            pixelData[dstOffset + x] = bit ? 255 : 0;
        }
    }
    
    return pixelData;
}

export async function processToGreyscale(
    input: string | Buffer,
    options: { width?: number; height?: number; resolveWithObject?: boolean } = {}
): Promise<Buffer | { data: Buffer; info: { width: number; height: number } }> {
    const { width: targetWidth, height: targetHeight, resolveWithObject = false } = options;
    
    let pixelData: Buffer;
    let imgWidth: number;
    let imgHeight: number;
    
    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        const header = parseBmpHeader(buffer);
        imgWidth = header.width;
        imgHeight = header.height;
        pixelData = extractBmpPixelData(buffer, imgWidth, imgHeight, header.pixelOffset, header.rowBytes);
    } else {
        const result = await sharp(buffer)
            .greyscale()
            .threshold(128)
            .raw()
            .toBuffer({ resolveWithObject: true });
        pixelData = result.data;
        imgWidth = result.info.width;
        imgHeight = result.info.height;
    }
    
    if (targetWidth && targetHeight && (imgWidth !== targetWidth || imgHeight !== targetHeight)) {
        const resized = Buffer.alloc(targetWidth * targetHeight);
        for (let y = 0; y < targetHeight; y++) {
            for (let x = 0; x < targetWidth; x++) {
                const srcX = Math.floor(x * imgWidth / targetWidth);
                const srcY = Math.floor(y * imgHeight / targetHeight);
                resized[y * targetWidth + x] = pixelData[srcY * imgWidth + srcX];
            }
        }
        pixelData = resized;
        imgWidth = targetWidth;
        imgHeight = targetHeight;
    }
    
    if (resolveWithObject) {
        return { data: pixelData, info: { width: imgWidth, height: imgHeight } };
    }
    return pixelData;
}

export async function extractRegion(
    imagePath: string,
    left: number,
    top: number,
    width: number,
    height: number
): Promise<Buffer> {
    const buffer = await fs.readFile(imagePath);
    
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        const header = parseBmpHeader(buffer);
        const pixelData = extractBmpPixelData(buffer, header.width, header.height, header.pixelOffset, header.rowBytes);
        
        const regionPixels = Buffer.alloc(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcX = left + x;
                const srcY = top + y;
                if (srcX >= 0 && srcX < header.width && srcY >= 0 && srcY < header.height) {
                    regionPixels[y * width + x] = pixelData[srcY * header.width + srcX];
                } else {
                    regionPixels[y * width + x] = 255;
                }
            }
        }
        
        return sharp(regionPixels, { raw: { width, height, channels: 1 } })
            .png()
            .toBuffer();
    }
    
    return sharp(imagePath)
        .extract({ left, top, width, height })
        .png()
        .toBuffer();
}
