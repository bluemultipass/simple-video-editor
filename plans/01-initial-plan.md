# Simple Video Editor — Initial Plan

## Overview

A desktop video editor built with **Tauri + Rust** backend and a web-based frontend.
All video processing is handled by **ffmpeg**, invoked as a Tauri sidecar or system binary.

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
Frontend (HTML/JS/CSS)
    │
    │  Tauri IPC commands
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

## ffmpeg Integration Strategy

### Phase 1 (development): system ffmpeg
- Require ffmpeg on PATH
- Fastest iteration — no binary management
- Abstracted behind a single `ffmpeg_path()` helper so the switch is trivial

### Phase 2 (release): bundled sidecar
- Ship an LGPL-only ffmpeg build with the app (no GPL codecs needed — all ops use copy or uncompressed)
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
├── src/                  # Frontend
│   ├── index.html
│   ├── main.js
│   └── style.css
├── src-tauri/
│   ├── binaries/         # ffmpeg sidecars (added before release)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── ffmpeg.rs     # All ffmpeg invocation logic
│   ├── Cargo.toml
│   └── tauri.conf.json
└── README.md
```

---

## Milestones

- [ ] Scaffold Tauri project (`npm create tauri-app`)
- [ ] Wire up `tauri-plugin-shell` and verify ffmpeg invocation
- [ ] Implement trim command (op 1) end-to-end
- [ ] Native file picker via `tauri-plugin-dialog`
- [ ] Implement remaining operations (2–5)
- [ ] Basic playback preview in frontend (`<video>` element)
- [ ] Progress reporting from ffmpeg stderr to frontend
- [ ] Replace system ffmpeg with bundled LGPL sidecar
- [ ] Build and test on all target platforms

---

## Open Questions

- [ ] Target platforms: Linux only, or also macOS / Windows?
- [ ] Frontend framework or vanilla JS?
- [ ] Do any operations need re-encoding? (Would require GPL ffmpeg build or alternative codec)
