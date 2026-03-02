# Simple Video Editor — Initial Plan

## Overview

A desktop video editor built with **Tauri + Rust** backend and a **SolidJS + TypeScript** frontend.
All video processing is handled by **ffmpeg**, invoked as a Tauri sidecar or system binary.

Target platforms: **Linux, macOS, Windows**

---

## Core Operations

| # | Operation | ffmpeg strategy | Notes |
|---|-----------|----------------|-------|
| 1 | Trim video | `-c copy` (no re-encode) | Fast, lossless cut |
| 2 | Extract frame | `-vframes 1` JPEG output | For thumbnails / preview |
| 3 | Remux container | `-c copy` | e.g. MKV → MP4 |
| 4 | Strip / replace audio | `-c:a pcm_s16le` WAV | Uncompressed, no codec license issues |
| 5 | Merge clips | concat demuxer, `-c copy` | No re-encode |

---

## Architecture

```
SolidJS + TypeScript frontend
    │
    │  Tauri IPC commands (strongly typed via @tauri-apps/api)
    ▼
Rust backend (src-tauri/)
    │
    │  spawn process
    ▼
ffmpeg binary
```

### Key Tauri plugins
- `tauri-plugin-shell` — invoke ffmpeg sidecar / system binary
- `tauri-plugin-dialog` — native file open/save dialogs
- `tauri-plugin-fs` — read file metadata, write temp files

---

## Tech Stack

### Frontend
| Concern | Choice |
|---------|--------|
| Framework | SolidJS |
| Language | TypeScript (strict mode) |
| Build tool | Vite |
| Package manager | pnpm |
| Linting | ESLint (with TS + SolidJS plugins) |
| Formatting | Prettier |
| Type checking | `tsc --noEmit` |
| Styling | Tailwind v4 (Vite-native, no config file) |
| UI components | Kobalte (headless, accessible primitives) |

### Backend
| Concern | Choice |
|---------|--------|
| Language | Rust |
| Linting | `cargo clippy -- -D warnings` |
| Formatting | `cargo fmt --check` |

### Tooling
| Concern | Choice |
|---------|--------|
| Git hooks | Husky (all hooks — frontend and backend) |
| Staged-file runner | lint-staged |
| Pre-commit checks (frontend) | ESLint --fix, Prettier --write, `tsc --noEmit` |
| Pre-commit checks (backend) | `cargo fmt --check`, `cargo clippy -D warnings` |
| Pre-push checks | `cargo test` |

---

## Git Hook Flow

```
git commit
    │
    └─ Husky .husky/pre-commit
        ├─ lint-staged
        │   ├─ ESLint --fix      (*.ts, *.tsx)
        │   └─ Prettier --write  (*.ts, *.tsx, *.css)
        ├─ tsc --noEmit
        ├─ cargo fmt --check
        └─ cargo clippy -- -D warnings

git push
    │
    └─ Husky .husky/pre-push
        └─ cargo test
```

---

## ffmpeg Integration Strategy

### Phase 1 (development): system ffmpeg
- Require ffmpeg on PATH
- Fastest iteration — no binary management
- Abstracted behind a single `ffmpeg_path()` helper so the switch is trivial

### Phase 2 (release): bundled sidecar
- Ship an LGPL-only ffmpeg build (no GPL codecs needed — all ops use copy or uncompressed)
- Per-platform binaries named with Tauri's target triple convention:
  ```
  src-tauri/binaries/
    ffmpeg-x86_64-unknown-linux-gnu
    ffmpeg-x86_64-apple-darwin
    ffmpeg-aarch64-apple-darwin
    ffmpeg-x86_64-pc-windows-msvc.exe
  ```
- Declared in `tauri.conf.json` under `bundle.externalBin`

---

## Project Structure (target)

```
simple-video-editor/
├── plans/
│   └── 01-initial-plan.md
├── src/                        # Frontend
│   ├── assets/
│   ├── components/
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── src-tauri/
│   ├── binaries/               # ffmpeg sidecars (added before release)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── ffmpeg.rs           # All ffmpeg invocation logic
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .husky/
│   ├── pre-commit
│   └── pre-push
├── .eslintrc.json
├── .prettierrc
├── tsconfig.json               # strict: true
├── vite.config.ts
├── package.json
├── pnpm-lock.yaml
└── README.md
```

---

## Milestones

- [x] Decide SolidJS ecosystem libraries (Tailwind v4, Kobalte)
- [x] Scaffold Tauri + SolidJS + TypeScript project with pnpm
- [x] Configure ESLint (strict TS + SolidJS rules), Prettier, tsconfig strict
- [x] Set up Husky + lint-staged (lint, format, typecheck, clippy, fmt on commit)
- [ ] Wire up `tauri-plugin-shell` and verify ffmpeg invocation
- [ ] Implement trim command (op 1) end-to-end
- [ ] Native file picker via `tauri-plugin-dialog`
- [ ] Implement remaining operations (2–5)
- [ ] Basic playback preview (`<video>` element)
- [ ] Progress reporting from ffmpeg stderr to frontend
- [ ] Replace system ffmpeg with bundled LGPL sidecar
- [ ] CI: build matrix for Linux, macOS, Windows

---

## Open Questions

- [ ] Routing — needed? (`@solidjs/router` if multi-view)
- [ ] Do any operations need re-encoding? (Would require GPL ffmpeg build)
