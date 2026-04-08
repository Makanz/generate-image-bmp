const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const {
    createSnapshotFilename,
    publishSnapshot,
    pruneSnapshotFiles,
    readOutputManifest,
    resolvePublishedImagePath
} = require('../src/utils/output-manifest');

describe('output-manifest helpers', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'output-manifest-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('returns an empty manifest when no manifest file exists yet', async () => {
        await expect(readOutputManifest(tempDir)).resolves.toEqual({
            current: null,
            previous: null
        });
    });

    test('publishes current and rotates the previous snapshot', async () => {
        const first = {
            file: createSnapshotFilename('2026-04-08T10:00:00.000Z'),
            generatedAt: '2026-04-08T10:00:00.000Z',
            checksum: 'sha256:first'
        };
        const second = {
            file: createSnapshotFilename('2026-04-08T10:05:00.000Z'),
            generatedAt: '2026-04-08T10:05:00.000Z',
            checksum: 'sha256:second'
        };

        await publishSnapshot(tempDir, first);
        const updated = await publishSnapshot(tempDir, second);

        expect(updated.current).toEqual(second);
        expect(updated.previous).toEqual(first);
        await expect(resolvePublishedImagePath(tempDir, 'current')).resolves.toBe(path.join(tempDir, second.file));
        await expect(resolvePublishedImagePath(tempDir, 'previous')).resolves.toBe(path.join(tempDir, first.file));
    });

    test('prunes old dashboard snapshots but keeps cache.json and recent debug files', async () => {
        const snapshotFiles = [
            'dashboard-2026-04-08T10-00-00-000Z.bmp',
            'dashboard-2026-04-08T10-05-00-000Z.bmp',
            'dashboard-2026-04-08T10-10-00-000Z.bmp',
            'dashboard-2026-04-08T10-15-00-000Z.bmp',
            'dashboard-2026-04-08T10-20-00-000Z.bmp',
            'dashboard-2026-04-08T10-25-00-000Z.bmp'
        ];

        await Promise.all(snapshotFiles.map((file) => fs.writeFile(path.join(tempDir, file), 'BM')));
        await fs.writeFile(path.join(tempDir, 'cache.json'), '{}');

        await pruneSnapshotFiles(tempDir, new Set([
            'dashboard-2026-04-08T10-25-00-000Z.bmp',
            'dashboard-2026-04-08T10-10-00-000Z.bmp'
        ]));

        const remainingFiles = await fs.readdir(tempDir);
        expect(remainingFiles).toEqual(expect.arrayContaining([
            'cache.json',
            'dashboard-2026-04-08T10-25-00-000Z.bmp',
            'dashboard-2026-04-08T10-20-00-000Z.bmp',
            'dashboard-2026-04-08T10-15-00-000Z.bmp',
            'dashboard-2026-04-08T10-10-00-000Z.bmp'
        ]));
        expect(remainingFiles).not.toEqual(expect.arrayContaining([
            'dashboard-2026-04-08T10-05-00-000Z.bmp',
            'dashboard-2026-04-08T10-00-00-000Z.bmp'
        ]));
    });
});
