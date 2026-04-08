import fs from 'fs/promises';
import path from 'path';

const OUTPUT_MANIFEST_FILENAME = 'dashboard-manifest.json';
const SNAPSHOT_FILE_PREFIX = 'dashboard-';
const SNAPSHOT_FILE_SUFFIX = '.bmp';
const RECENT_SNAPSHOT_DEBUG_WINDOW = 2;

export interface PublishedImageSnapshot {
    file: string;
    generatedAt: string;
    checksum: string;
}

export interface OutputManifest {
    current: PublishedImageSnapshot | null;
    previous: PublishedImageSnapshot | null;
}

export type PublishedImageKind = 'current' | 'previous';

const EMPTY_OUTPUT_MANIFEST: OutputManifest = {
    current: null,
    previous: null
};

function getOutputManifestPath(outputDir: string): string {
    return path.join(outputDir, OUTPUT_MANIFEST_FILENAME);
}

function isPublishedImageSnapshot(value: unknown): value is PublishedImageSnapshot {
    return (
        typeof value === 'object' &&
        value !== null &&
        'file' in value &&
        'generatedAt' in value &&
        'checksum' in value &&
        typeof value.file === 'string' &&
        typeof value.generatedAt === 'string' &&
        typeof value.checksum === 'string'
    );
}

function isOutputManifest(value: unknown): value is OutputManifest {
    return (
        typeof value === 'object' &&
        value !== null &&
        'current' in value &&
        'previous' in value &&
        (value.current === null || isPublishedImageSnapshot(value.current)) &&
        (value.previous === null || isPublishedImageSnapshot(value.previous))
    );
}

export function createSnapshotFilename(generatedAt: string): string {
    const safeStamp = generatedAt.replace(/[:.]/g, '-');
    return `${SNAPSHOT_FILE_PREFIX}${safeStamp}${SNAPSHOT_FILE_SUFFIX}`;
}

export async function readOutputManifest(outputDir: string): Promise<OutputManifest> {
    try {
        const raw = await fs.readFile(getOutputManifestPath(outputDir), 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        return isOutputManifest(parsed) ? parsed : EMPTY_OUTPUT_MANIFEST;
    } catch {
        return EMPTY_OUTPUT_MANIFEST;
    }
}

export async function writeOutputManifest(outputDir: string, manifest: OutputManifest): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    const manifestPath = getOutputManifestPath(outputDir);
    const tempManifestPath = `${manifestPath}.tmp`;
    await fs.writeFile(tempManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    await fs.rename(tempManifestPath, manifestPath);
}

export async function publishSnapshot(outputDir: string, next: PublishedImageSnapshot): Promise<OutputManifest> {
    const currentManifest = await readOutputManifest(outputDir);
    const updatedManifest: OutputManifest = {
        current: next,
        previous: currentManifest.current
    };

    await writeOutputManifest(outputDir, updatedManifest);
    return updatedManifest;
}

export async function resolvePublishedSnapshot(
    outputDir: string,
    kind: PublishedImageKind
): Promise<PublishedImageSnapshot | null> {
    const manifest = await readOutputManifest(outputDir);
    return manifest[kind];
}

export async function resolvePublishedImagePath(
    outputDir: string,
    kind: PublishedImageKind
): Promise<string | null> {
    const snapshot = await resolvePublishedSnapshot(outputDir, kind);
    return snapshot ? path.join(outputDir, snapshot.file) : null;
}

export async function pruneSnapshotFiles(outputDir: string, keepFiles: Set<string>): Promise<void> {
    const files = await fs.readdir(outputDir);
    const snapshotFiles = files
        .filter((file) => file.startsWith(SNAPSHOT_FILE_PREFIX) && file.endsWith(SNAPSHOT_FILE_SUFFIX))
        .sort()
        .reverse();

    const extraRecentFiles = snapshotFiles
        .filter((file) => !keepFiles.has(file))
        .slice(0, RECENT_SNAPSHOT_DEBUG_WINDOW);

    const preservedFiles = new Set<string>([...keepFiles, ...extraRecentFiles]);

    await Promise.all(
        snapshotFiles
            .filter((file) => !preservedFiles.has(file))
            .map((file) => fs.unlink(path.join(outputDir, file)))
    );
}
