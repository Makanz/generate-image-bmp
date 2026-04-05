import path from 'path';

export function getAppRoot(): string {
    const normalizedPath = __dirname.replace(/\\/g, '/');
    return normalizedPath.includes('/dist/')
        ? path.resolve(__dirname, '..', '..', '..')
        : path.resolve(__dirname, '..', '..');
}
