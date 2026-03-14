# SkillsBench Website

Next.js website for SkillsBench, including packaged trajectory/result data for:

- `Terminus-2 (GPT-oss-120B)` from Harbor job `2026-03-12__23-23-51`
- `Terminus-2 (Qwen3.5-35B)` from Harbor job `2026-03-13__23-23-09`

## Collaborator Quick Start

```bash
bun install
bun dev
```

Open `http://localhost:3000`.

## Build

```bash
bun run build
```

This build is self-contained and uses committed registry files + packaged Harbor data.

## What Is Packaged

- Registry data in `src/data/`:
  - `tasks-registry.json`
  - `skills-registry.json`
  - `verifiers-registry.json`
  - `results-registry.json`
  - `trajectories-index.json`
- Raw Harbor trajectory artifacts in `public/harbor-jobs/...` for runtime trace viewing.

## Refresh Packaged Data (Maintainers)

If you have the full Harbor repo with local `harbor/jobs/`:

```bash
bun run refresh-share-data
```

This regenerates registries and repackages required Harbor files into `public/harbor-jobs/`.

## Optional Full Build Regeneration

To force full regeneration before build:

```bash
bun run build:full
```
