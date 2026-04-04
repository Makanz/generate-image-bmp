import sharp from 'sharp';
import { GREYSCALE_THRESHOLD } from '../utils/constants';

export async function processToGreyscale(
    input: string | Buffer,
    options: { width?: number; height?: number; resolveWithObject?: boolean } = {}
): Promise<Buffer | { data: Buffer; info: sharp.OutputInfo }> {
    const { width, height, resolveWithObject = false } = options;
    let pipeline = sharp(input);
    if (width && height) {
        pipeline = pipeline.resize(width, height);
    }
    pipeline = pipeline.greyscale().threshold(GREYSCALE_THRESHOLD).raw();
    return resolveWithObject
        ? pipeline.toBuffer({ resolveWithObject: true })
        : pipeline.toBuffer();
}

export async function extractRegion(
    imagePath: string,
    left: number,
    top: number,
    width: number,
    height: number
): Promise<Buffer> {
    return sharp(imagePath)
        .extract({ left, top, width, height })
        .png()
        .toBuffer();
}
