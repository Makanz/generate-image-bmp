import { defineConfig } from 'vite';

const design = process.env.DASHBOARD_DESIGN || 'classic';

/**
 * I dev: om en annan design än classic är vald (DASHBOARD_DESIGN), omdirigera
 * GET / till den designens index.html så dev och prod beter sig lika.
 * Bygget byggar alltid båda designerna oavsett detta värde.
 */
function devDesignRedirect() {
    return {
        name: 'design-redirect',
        configureServer(server) {
            if (design === 'classic') return;
            server.middlewares.use((req, res, next) => {
                const pathname = req.url ? req.url.split('?')[0] : req.url;
                if (pathname === '/') {
                    const search = req.url && req.url.includes('?')
                        ? req.url.slice(req.url.indexOf('?'))
                        : '';
                    res.writeHead(302, { Location: `/${design}/index.html${search}` });
                    res.end();
                    return;
                }
                next();
            });
        },
    };
}

export default defineConfig({
    root: 'dashboard-web',
    plugins: [devDesignRedirect()],
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'dashboard-web/index.html',
                summer: 'dashboard-web/summer/index.html',
            },
        },
    },
});