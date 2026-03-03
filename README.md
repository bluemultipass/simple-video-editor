# Simple Video Editor

A lightweight desktop video editor built with [Tauri](https://tauri.app) (Rust backend) and [SolidJS](https://solidjs.com) (TypeScript frontend).

## Operations

- **Trim** — lossless cut with `-c copy` (no re-encode)
- **Extract frame** — JPEG thumbnail at any timestamp
- **Remux** — change container format (e.g. MKV → MP4) without re-encoding
- **Strip audio** — remove or replace audio track
- **Merge clips** — concatenate clips without re-encoding

## Prerequisites

- [Rust](https://rustup.rs)
- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) 10+
- Tauri system dependencies for your OS:
  - **Linux (Debian/Ubuntu)**
    ```sh
    sudo apt-get update
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev \
      build-essential \
      libssl-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev
    ```
  - **macOS/Windows** — see [Tauri prerequisites](https://tauri.app/start/prerequisites/)
- `ffmpeg` on your `PATH` (development — bundled binary planned for release)

## Development

```sh
pnpm install
pnpm tauri dev
```

## Checks

```sh
pnpm typecheck       # tsc --noEmit
pnpm lint            # ESLint
pnpm format:check    # Prettier

cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Pre-commit hooks run all of the above automatically via Husky.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop shell | Tauri 2 |
| Frontend | SolidJS + TypeScript (strict) |
| Styling | Tailwind v4 |
| UI primitives | Kobalte |
| Build | Vite + pnpm |
| Video processing | ffmpeg (system binary → bundled sidecar) |

## Recommended IDE

[VS Code](https://code.visualstudio.com/) with the [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) extensions.
