import path from 'path';

export function getAppRoot(): string {
    return path.resolve(__dirname, '..', '..');
}
