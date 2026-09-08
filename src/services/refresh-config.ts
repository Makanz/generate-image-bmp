import fs from 'fs/promises';
import path from 'path';
import { getAppRoot } from '../utils/path';

const MIN_INTERVAL_SECONDS = 1;
const MAX_INTERVAL_SECONDS = 3600;

interface RefreshConfig {
    refreshIntervalSeconds?: number;
}

function getConfigFile(): string {
    return path.join(getAppRoot(), 'output', 'config.json');
}

function isValidInterval(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_INTERVAL_SECONDS &&
        value <= MAX_INTERVAL_SECONDS
    );
}

/**
 * Loads the runtime-set refresh interval (in seconds) from the persisted
 * config file. Returns null when the file is missing, corrupt, or holds an
 * out-of-range value, so callers fall back to the env default.
 */
export async function loadRefreshIntervalSeconds(): Promise<number | null> {
    try {
        const raw = await fs.readFile(getConfigFile(), 'utf-8');
        const config: RefreshConfig = JSON.parse(raw);
        return isValidInterval(config.refreshIntervalSeconds) ? config.refreshIntervalSeconds : null;
    } catch {
        // File missing or corrupt — fall back to env default
        return null;
    }
}

/**
 * Persists the runtime-set refresh interval (in seconds) so it survives a
 * server restart. Non-fatal on failure — the in-memory interval is still valid.
 */
export async function persistRefreshIntervalSeconds(seconds: number): Promise<void> {
    try {
        const configFile = getConfigFile();
        await fs.mkdir(path.dirname(configFile), { recursive: true });
        await fs.writeFile(configFile, JSON.stringify({ refreshIntervalSeconds: seconds }, null, 2), 'utf-8');
    } catch {
        // Non-fatal — in-memory interval is still valid
    }
}
