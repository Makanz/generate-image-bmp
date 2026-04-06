---
name: idea-generation
description: Guide for analysing the codebase and the existing ideas in the `ideas/` directory, then generating new numbered idea markdown files for this project. Use when asked to brainstorm, add, or create new ideas for the project.
---

# Idea Generation Workflow

Use this skill when asked to come up with new ideas, improvements, or feature proposals for this project. The goal is to produce well-researched, actionable markdown files in the `ideas/` directory that follow the same format and numbering convention as the existing ones.

## Step 1 — Read the existing ideas

1. List all files in the `ideas/` directory and note the highest prefix number (e.g. `04` → next is `05`).
2. Read **every** existing idea file to understand:
   - What has already been proposed (avoid duplicates).
   - The writing style and structure used.
   - The priority levels and impact area categories already in use.

## Step 2 — Analyse the codebase for improvement opportunities

Read the key files to identify gaps, pain points, and potential enhancements:

- `server.ts` — API endpoints, cron scheduling, error handling
- `capture.ts` — image generation pipeline, change detection
- `src/services/data.ts` — data fetching, caching strategy
- `src/services/homey.ts` — external integrations
- `src/image/bmp-writer.ts` — BMP output format
- `dashboard-web/index.html`, `script.js`, `style.css` — frontend
- `package.json` — dependencies and scripts
- `AGENTS.md` — project context and architecture overview

Look for patterns like:

- Hardcoded values that should be configurable
- Missing resilience (retries, fallbacks, health signals)
- Missing developer-experience improvements (logging, tooling, tests)
- Performance bottlenecks
- UX gaps on the dashboard or the ESP32 display

## Step 3 — Generate new ideas

Come up with ideas that are:

- **Not already covered** by the existing idea files
- **Grounded** in actual code observations (reference specific files and line patterns)
- **Varied in scope** — mix quick wins with larger architectural improvements
- **Relevant to this project's purpose**: e-paper dashboard for an ESP32, driven by n8n webhooks

Aim for at least 3 new ideas per session unless instructed otherwise.

## Step 4 — Write one markdown file per idea

### File naming

```
ideas/<NN>-<short-kebab-title>.md
```

where `<NN>` is the next sequential two-digit prefix (zero-padded, e.g. `05`, `06`).

### Required format

Every idea file must follow this exact structure:

````markdown
# <Impact Level> Impact: <Title>

**Priority:** High | Medium | Low
**Impact Areas:** <comma-separated list, e.g. Reliability, Performance, UX>

## Problem

<Describe the specific problem in the current codebase. Reference actual files,
functions, or patterns. Make it clear why this matters for this project.>

## Solution

### 1. <First sub-step or component>

<Describe the change. Include a TypeScript/JavaScript code snippet when helpful.>

```typescript
// Example code
```
````

### 2. <Second sub-step or component>

...

## Files to Change

| File              | Change                          |
| ----------------- | ------------------------------- |
| `path/to/file.ts` | Short description of the change |

## Verification

- <Concrete, testable assertion that the change works correctly.>
- <Another assertion.>

```

### Quality bar

- The **Problem** section must cite at least one specific file or code pattern from the actual codebase.
- The **Solution** section must include at least one code snippet for non-trivial changes.
- The **Verification** section must list steps that can be confirmed by running `pnpm test` or by manual observation.
- Do **not** duplicate ideas already described in existing files.
- Write in the same tone as the existing files: direct, technical, implementation-focused.

## Step 5 — Commit and push (if requested)

After creating the files:

1. Run `pnpm test` and confirm all tests pass before committing.
2. Stage only the new idea files:
```

git add ideas/

```
3. Commit with a message following the pattern:
```

docs(ideas): add <N> new improvement ideas (<range>)

- <NN>: one-line summary
- <NN>: one-line summary
  ...

```
4. Push to the current branch.
```
