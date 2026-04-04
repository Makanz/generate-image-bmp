import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { processToGreyscale } from './image-processing';
import { WIDTH, HEIGHT, MERGE_DISTANCE } from '../utils/constants';

export interface ChangeRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface MergedRegion {
    x: number;
    y: number;
    maxX: number;
    maxY: number;
}

export interface ChangesResult {
    changes: ChangeRegion[];
    currentChecksum: string | null;
    previousChecksum: string | null;
    timestamp: string;
}

export async function computeChecksum(filePath: string): Promise<string | null> {
    try {
        const buffer = await fs.readFile(filePath);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        return `sha256:${hash}`;
    } catch {
        return null;
    }
}

export async function detectChanges(currentPath: string, previousPath: string): Promise<ChangeRegion[]> {
    const currentImage = await processToGreyscale(currentPath, { width: WIDTH, height: HEIGHT }) as Buffer;
    const previousImage = await processToGreyscale(previousPath, { width: WIDTH, height: HEIGHT }) as Buffer;

    const changes: ChangeRegion[] = [];
    const visited = Buffer.alloc(WIDTH * HEIGHT, 0);

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const idx = y * WIDTH + x;
            if (visited[idx]) continue;

            const currentByte = currentImage[idx];
            const previousByte = previousImage[idx];

            if (currentByte !== previousByte) {
                let minX = x, maxX = x, minY = y, maxY = y;
                const stack: [number, number][] = [[x, y]];

                while (stack.length > 0) {
                    const [cx, cy] = stack.pop()!;
                    const cIdx = cy * WIDTH + cx;

                    if (cx < 0 || cx >= WIDTH || cy < 0 || cy >= HEIGHT) continue;
                    if (visited[cIdx]) continue;

                    const cCur = currentImage[cIdx];
                    const cPrev = previousImage[cIdx];
                    if (cCur === cPrev) continue;

                    visited[cIdx] = 1;

                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    stack.push([cx + 1, cy]);
                    stack.push([cx - 1, cy]);
                    stack.push([cx, cy + 1]);
                    stack.push([cx, cy - 1]);
                }

                changes.push({
                    x: minX,
                    y: minY,
                    width: maxX - minX + 1,
                    height: maxY - minY + 1
                });
            }
        }
    }

    const mergedChanges = mergeRegions(changes, MERGE_DISTANCE);

    return mergedChanges;
}

export function mergeRegions(regions: ChangeRegion[], distance: number): ChangeRegion[] {
    if (regions.length <= 1) return regions;

    const merged: MergedRegion[] = regions.map(r => ({
        x: r.x,
        y: r.y,
        maxX: r.x + r.width - 1,
        maxY: r.y + r.height - 1
    }));

    const used = new Set<number>();
    let changed = true;
    while (changed) {
        changed = false;

        for (let i = 0; i < merged.length; i++) {
            if (used.has(i)) continue;

            for (let j = i + 1; j < merged.length; j++) {
                if (used.has(j)) continue;

                const r1 = merged[i];
                const r2 = merged[j];

                const horizontalOverlap = r1.x - distance <= r2.maxX + distance &&
                                          r1.maxX + distance >= r2.x - distance;
                const verticalOverlap = r1.y - distance <= r2.maxY + distance &&
                                        r1.maxY + distance >= r2.y - distance;

                if (horizontalOverlap && verticalOverlap) {
                    r1.x = Math.min(r1.x, r2.x);
                    r1.y = Math.min(r1.y, r2.y);
                    r1.maxX = Math.max(r1.maxX, r2.maxX);
                    r1.maxY = Math.max(r1.maxY, r2.maxY);
                    used.add(j);
                    changed = true;
                }
            }
        }
    }

    const result: ChangeRegion[] = [];
    for (let i = 0; i < merged.length; i++) {
        if (!used.has(i)) {
            result.push({
                x: merged[i].x,
                y: merged[i].y,
                width: merged[i].maxX - merged[i].x + 1,
                height: merged[i].maxY - merged[i].y + 1
            });
        }
    }
    return result;
}

export async function getChanges(outputDir: string): Promise<ChangesResult> {
    const currentPath = path.join(outputDir, 'dashboard.png');
    const previousPath = path.join(outputDir, 'dashboard.previous.png');

    const currentExists = await fileExists(currentPath);
    const previousExists = await fileExists(previousPath);

    if (!currentExists) {
        return { changes: [], currentChecksum: null, previousChecksum: null, timestamp: new Date().toISOString() };
    }

    const currentChecksum = await computeChecksum(currentPath);
    const previousChecksum = previousExists ? await computeChecksum(previousPath) : null;

    if (!previousExists) {
        return { changes: [], currentChecksum, previousChecksum, timestamp: new Date().toISOString() };
    }

    const changes = await detectChanges(currentPath, previousPath);

    return {
        changes,
        currentChecksum,
        previousChecksum,
        timestamp: new Date().toISOString()
    };
}

async function fileExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true).catch(() => false);
}
