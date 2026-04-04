import path from 'path';

export function getAppRoot(): string {
    return __filename.endsWith('.ts') ? __dirname : path.join(__dirname, '..');
}
