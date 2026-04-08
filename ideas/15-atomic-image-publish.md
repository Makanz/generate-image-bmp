# High Impact: Atomic Image Publish with Versioned Snapshots

**Priority:** High
**Impact Areas:** Reliability, data integrity, ESP32 update safety

## Problem

`capture.ts` currently saves `dashboard.previous.bmp` and then overwrites `dashboard.bmp` in place:

```typescript
const previousBmp = path.join(OUTPUT_DIR, 'dashboard.previous.bmp');
if (currentBmpExists) {
    await fs.copyFile(outputBmp, previousBmp);
}
await writeBmp(greyscaleResult.info.width, greyscaleResult.info.height, greyscaleResult.data, outputBmp);
```

At the same time, `server.ts` serves those fixed filenames directly from `output/` through `/dashboard.bmp`, `/dashboard.previous.bmp`, and `/output/:filename`. That means the ESP32 or a browser client can read the file while it is being rewritten. A slow disk write, process crash, or host restart can leave:

- a truncated `dashboard.bmp`
- a `dashboard.previous.bmp` that no longer matches the last published image
- change detection comparing a valid old file against a half-written new one

The existing concurrent-generation guard reduces overlap between two writers, but it does not protect readers from observing an in-progress overwrite.

## Solution

### 1. Write every generation to a versioned snapshot file

Instead of rendering directly to `output/dashboard.bmp`, write to a timestamped file such as `output/dashboard-20260408T090401.bmp`.

```typescript
interface PublishedImageSnapshot {
    file: string;
    generatedAt: string;
    checksum: string;
}

function createSnapshotPath(outputDir: string, generatedAt: string): string {
    const safeStamp = generatedAt.replace(/[:.]/g, '-');
    return path.join(outputDir, `dashboard-${safeStamp}.bmp`);
}
```

This guarantees the file being generated is never the same file currently being served.

### 2. Publish by atomically updating a manifest file

Store the public "current" and "previous" image pointers in a small manifest, and only swap that manifest after the new BMP is fully written and validated.

```typescript
interface OutputManifest {
    current: PublishedImageSnapshot | null;
    previous: PublishedImageSnapshot | null;
}

async function publishSnapshot(next: PublishedImageSnapshot, manifestPath: string): Promise<void> {
    const current = await readManifest(manifestPath);
    const updated: OutputManifest = {
        current: next,
        previous: current.current
    };

    const tempManifest = `${manifestPath}.tmp`;
    await fs.writeFile(tempManifest, JSON.stringify(updated, null, 2), 'utf-8');
    await fs.rename(tempManifest, manifestPath);
}
```

The BMP becomes public only after the manifest update succeeds, so readers always resolve to a complete file.

### 3. Resolve `/dashboard.bmp` and change detection through the manifest

Keep the public routes unchanged, but make `server.ts` and `getChanges()` resolve aliases through the manifest instead of hardcoded filenames.

```typescript
app.get('/dashboard.bmp', async (_req, res) => {
    const manifest = await readManifest(MANIFEST_PATH);
    if (!manifest.current) {
        return res.status(404).json({ error: 'Image not generated yet' });
    }

    res.sendFile(path.join(APP_ROOT, 'output', manifest.current.file));
});
```

The same helper can resolve the previous file for `/dashboard.previous.bmp` and for `getChanges()`.

### 4. Prune old snapshots after publish

Keep only the current image, the previous image, and a small safety window of recent snapshots for debugging.

```typescript
async function pruneSnapshots(outputDir: string, keep: Set<string>): Promise<void> {
    const files = await fs.readdir(outputDir);
    await Promise.all(
        files
            .filter(file => file.startsWith('dashboard-') && file.endsWith('.bmp') && !keep.has(file))
            .map(file => fs.unlink(path.join(outputDir, file)))
    );
}
```

## Files to Change

| File | Change |
| ---- | ------ |
| `capture.ts` | Write BMPs to versioned snapshot files and publish through a manifest instead of overwriting `dashboard.bmp` directly |
| `src/services/change-detection.ts` | Resolve current/previous BMP paths through the manifest |
| `server.ts` | Serve `/dashboard.bmp` and `/dashboard.previous.bmp` via manifest lookup |
| `src/utils/output-manifest.ts` | New helper for reading, writing, and pruning snapshot manifests |
| `tests/capture.test.js` | Add tests for manifest publish order and snapshot pruning |
| `tests/server.test.js` | Add tests that `/dashboard.bmp` resolves the manifest target and returns 404 before first publish |

## Verification

- After a successful generation, the manifest points to a new versioned BMP and the previous manifest entry still points to the prior image.
- Interrupting the process during generation never exposes a partially written file through `/dashboard.bmp`.
- `/api/changes` compares the manifest-resolved current and previous snapshots and still returns valid checksums.
- Old snapshot BMPs are pruned without deleting the current or previous published files.

