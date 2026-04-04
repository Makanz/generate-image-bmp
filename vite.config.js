import { defineConfig } from 'vite';

export default defineConfig({
    root: 'dashboard-web',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'dashboard-web/index.html'
            }
        }
    }
});
