## 1. Performance Optimizations
- Cache image diff calculations in `src/services/change-detection.ts` using an in‑memory cache (e.g., `node-cache`).
- Enable GZIP compression for `/api/data` responses via `compression()` middleware in `server.ts`.
- Use `sharp` streaming to avoid buffering the entire PNG before converting to BMP.