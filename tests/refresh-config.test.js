const fs = require('fs');
const os = require('os');
const path = require('path');

let mockTempDir;

jest.mock('../src/utils/path', () => ({
    getAppRoot: () => mockTempDir
}));

const { loadRefreshIntervalSeconds, persistRefreshIntervalSeconds } = require('../src/services/refresh-config');

describe('refresh-config', () => {
    beforeEach(() => {
        mockTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-config-'));
    });

    afterEach(() => {
        fs.rmSync(mockTempDir, { recursive: true, force: true });
    });

    test('returns null when the config file does not exist', async () => {
        expect(await loadRefreshIntervalSeconds()).toBeNull();
    });

    test('persists and reloads the interval', async () => {
        await persistRefreshIntervalSeconds(600);
        expect(await loadRefreshIntervalSeconds()).toBe(600);
    });

    test('overwrites a previously persisted interval', async () => {
        await persistRefreshIntervalSeconds(600);
        await persistRefreshIntervalSeconds(120);
        expect(await loadRefreshIntervalSeconds()).toBe(120);
    });

    test('returns null for a corrupt config file', async () => {
        fs.mkdirSync(path.join(mockTempDir, 'output'), { recursive: true });
        fs.writeFileSync(path.join(mockTempDir, 'output', 'config.json'), 'not json');
        expect(await loadRefreshIntervalSeconds()).toBeNull();
    });

    test('returns null for an out-of-range interval', async () => {
        fs.mkdirSync(path.join(mockTempDir, 'output'), { recursive: true });
        fs.writeFileSync(
            path.join(mockTempDir, 'output', 'config.json'),
            JSON.stringify({ refreshIntervalSeconds: 99999 })
        );
        expect(await loadRefreshIntervalSeconds()).toBeNull();
    });
});
