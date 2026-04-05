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

    return mergeRegions(changes, MERGE_DISTANCE);
}

class UnionFind {
    parent: number[];

    constructor(n: number) {
        this.parent = Array.from({ length: n }, (_, i) => i);
    }

    find(i: number): number {
        while (this.parent[i] !== i) {
            this.parent[i] = this.parent[this.parent[i]]; // Path halving
            i = this.parent[i];
        }
        return i;
    }

    union(i: number, j: number): void {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) {
            this.parent[rootI] = rootJ;
        }
    }
}

function regionsOverlap(r1: ChangeRegion, r2: ChangeRegion, distance: number): boolean {
    const horizontalOverlap = r1.x - distance <= r2.x + r2.width + distance &&
                              r1.x + r1.width + distance >= r2.x - distance;
    const verticalOverlap = r1.y - distance <= r2.y + r2.height + distance &&
                            r1.y + r1.height + distance >= r2.y - distance;
    return horizontalOverlap && verticalOverlap;
}

export function mergeRegions(regions: ChangeRegion[], distance: number): ChangeRegion[] {
    if (regions.length <= 1) return regions;

    const uf = new UnionFind(regions.length);

    for (let i = 0; i < regions.length; i++) {
        for (let j = i + 1; j < regions.length; j++) {
            if (regionsOverlap(regions[i], regions[j], distance)) {
                uf.union(i, j);
            }
        }
    }

    const groups = new Map<number, ChangeRegion[]>();
    for (let i = 0; i < regions.length; i++) {
        const root = uf.find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push(regions[i]);
    }

    const result: ChangeRegion[] = [];
    for (const group of groups.values()) {
        const minX = Math.min(...group.map(r => r.x));
        const minY = Math.min(...group.map(r => r.y));
        const maxX = Math.max(...group.map(r => r.x + r.width));
        const maxY = Math.max(...group.map(r => r.y + r.height));
        result.push({
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        });
    }

    return result;
}

export async function getChanges(outputDir: string): Promise<ChangesResult> {
    const currentPath = path.join(outputDir, 'dashboard.bmp');
    const previousPath = path.join(outputDir, 'dashboard.previous.bmp');

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
