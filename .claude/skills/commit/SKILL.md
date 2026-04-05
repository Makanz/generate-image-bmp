---
name: commit
description: Guide for creating well-formed git commits in this project. Use when asked to commit changes, create a commit message, or prepare code for committing.
---

## Before You Commit

Always run the test suite before committing. Do not commit if any tests fail.

```bash
pnpm test
```

If tests fail, fix the failures before proceeding.

## Commit Message Format

Use **Conventional Commits** format:

```
type(scope): short imperative description

Optional longer body explaining *why* (not what — the diff shows that).
Wrap at 72 characters per line.
```

### Types

| Type       | When to use                                         |
|------------|-----------------------------------------------------|
| `feat`     | A new feature                                       |
| `fix`      | A bug fix                                           |
| `refactor` | Code change with no behavior change                 |
| `test`     | Adding or updating tests only                       |
| `docs`     | Documentation only (README, AGENTS.md, comments)   |
| `chore`    | Tooling, config, dependencies, build scripts        |
| `perf`     | Performance improvement                             |
| `style`    | Formatting, whitespace — no logic change            |

### Rules

- Subject line: **imperative mood**, lowercase after the colon, no trailing period.
  - ✅ `feat(capture): add change-detection threshold option`
  - ❌ `Added change detection threshold option.`
- Keep the subject line ≤ 72 characters.
- Omit the scope when the change is truly cross-cutting.
- Use the body to explain *motivation* and *context*, not to repeat the diff.

### Co-author trailer

When a commit is AI-assisted, append this trailer after a blank line:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Splitting Into Multiple Commits

A commit should represent one coherent, self-contained change. Split when:

- **Different concerns are mixed** — e.g. a bug fix and a new feature landed in the
  same set of edits. Separate them so each commit passes tests on its own.
- **Refactor precedes feature** — first commit the refactor, then build the feature on
  top. This makes review and bisect easier.
- **Tests accompany the code they test** — commit new tests together with the code
  they cover in the same commit, unless the tests are purely additive fixes.
- **Documentation follows behavior** — if a change needs README or AGENTS.md updates,
  include them in the same commit as the code change they describe.

### How to split with staged hunks

```bash
git add -p          # Interactively stage only the relevant hunks
git commit          # Commit the staged changes
# Repeat for remaining changes
```

## Examples

```
feat(server): add /api/status endpoint for health checks
```

```
fix(capture): prevent race condition on concurrent refresh calls

Two simultaneous POST /api/refresh calls could both invoke generateImage()
at the same time. Added an in-flight guard flag to skip the second call.
```

```
refactor(data): extract fetchWithRetry helper

Removes duplication between weather, calendar, and lunch fetch paths.
No behavior change.
```
