# Step 2 — ffmpeg IPC Layer

## Goal

Wire up `tauri-plugin-shell` and implement the Rust ffmpeg module so the
frontend can invoke all five video operations via typed Tauri commands.
By the end of this step, a single end-to-end trim operation should work.

---

## Architecture

```
Frontend (TypeScript)
  invoke("trim_video", { input_path, output_path, start_secs, end_secs })
      │
      │  Tauri IPC (serialised via serde_json)
      ▼
src-tauri/src/commands.rs
  #[tauri::command] trim_video(...)
      │
      ▼
src-tauri/src/ffmpeg.rs
  run_ffmpeg(args: &[&str]) -> Result<FfmpegOutput, FfmpegError>
      │
      ▼
tauri-plugin-shell  →  ffmpeg binary (system PATH for now)
```

All ffmpeg logic lives in `ffmpeg.rs`. Commands in `commands.rs` are thin
translators between the IPC surface and the ffmpeg module — no business logic
in command handlers.

---

## Why tauri-plugin-shell (not std::process::Command)

`std::process::Command` would work for phase 1 (system ffmpeg), but
`tauri-plugin-shell` is required for the sidecar approach in phase 2
(bundled binary). Starting with the plugin now means zero refactor later.
It also gives us streaming stderr via Tauri events without rolling our own
thread management.

---

## Packages to Install

### Rust (src-tauri/Cargo.toml)

```toml
[dependencies]
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
thiserror = "2"         # ergonomic error types
```

### Frontend (package.json)

```
@tauri-apps/plugin-shell
@tauri-apps/plugin-dialog
@tauri-apps/plugin-fs
```

---

## Capability / Permissions

`src-tauri/capabilities/default.json` needs shell and dialog permissions added:

```json
{
  "permissions": [
    "core:default",
    "opener:default",
    "shell:allow-execute",
    "shell:allow-kill",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-read-dir",
    "fs:allow-exists"
  ]
}
```

`shell:allow-execute` must also be scoped in `tauri.conf.json` to only permit
the ffmpeg binary (prevents arbitrary shell execution):

```json
{
  "plugins": {
    "shell": {
      "open": false,
      "scope": [
        {
          "name": "ffmpeg",
          "cmd": "ffmpeg",
          "args": true,
          "sidecar": false
        }
      ]
    }
  }
}
```

When switching to the bundled sidecar in phase 2, change `"sidecar": true`
and `"cmd": "ffmpeg"` refers to the binary name declared in `externalBin`.

---

## Rust Module Structure

```
src-tauri/src/
├── main.rs          — entry point, unchanged
├── lib.rs           — plugin registration, invoke_handler
├── commands.rs      — #[tauri::command] handlers (thin)
└── ffmpeg.rs        — all ffmpeg invocation logic
```

### ffmpeg.rs responsibilities

- Locate the ffmpeg binary (system PATH in phase 1, sidecar path in phase 2)
- Build argument lists for each operation
- Spawn the process and capture stdout/stderr
- Parse exit code and surface errors
- Emit progress events from stderr lines (phase 2)

### Error type

```rust
// ffmpeg.rs
#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum FfmpegError {
    #[error("ffmpeg process failed (exit {code}): {stderr}")]
    ProcessFailed { code: i32, stderr: String },

    #[error("ffmpeg not found on PATH")]
    NotFound,

    #[error("io error: {0}")]
    Io(#[from] #[serde(skip)] std::io::Error),
}
```

`serde::Serialize` on the error lets Tauri serialise it back to the frontend
automatically via `Result<T, FfmpegError>`.

### Core function signature

```rust
// ffmpeg.rs
pub async fn run_ffmpeg(args: &[&str]) -> Result<(), FfmpegError>
```

All five operations call this with their specific argument slices.

### Operation argument builders (in ffmpeg.rs)

```rust
pub fn trim_args<'a>(input: &'a str, output: &'a str, start: f64, end: f64) -> Vec<&'a str>
pub fn extract_frame_args<'a>(input: &'a str, output: &'a str, at: f64) -> Vec<&'a str>
pub fn remux_args<'a>(input: &'a str, output: &'a str) -> Vec<&'a str>
pub fn strip_audio_args<'a>(input: &'a str, output: &'a str) -> Vec<&'a str>
pub fn merge_args<'a>(inputs: &'a [String], list_file: &'a str, output: &'a str) -> Vec<&'a str>
```

Keeping arg builders as pure functions (no I/O) means they can be unit-tested
without spawning a process.

---

## TypeScript IPC Layer

### Type definitions (src/lib/ffmpeg.ts)

```ts
export interface TrimOptions {
  inputPath: string
  outputPath: string
  startSecs: number
  endSecs: number
}

export interface ExtractFrameOptions {
  inputPath: string
  outputPath: string
  atSecs: number
}

export interface RemuxOptions {
  inputPath: string
  outputPath: string
}

export interface StripAudioOptions {
  inputPath: string
  outputPath: string
}

export interface MergeOptions {
  inputPaths: string[]
  outputPath: string
}

// Matches FfmpegError on the Rust side
export interface FfmpegError {
  ProcessFailed?: { code: number; stderr: string }
  NotFound?: null
  Io?: string
}
```

### Command wrappers (src/lib/ffmpeg.ts)

```ts
import { invoke } from "@tauri-apps/api/core"
import type { TrimOptions, FfmpegError } from "./types"

export async function trimVideo(opts: TrimOptions): Promise<void> {
  return invoke("trim_video", opts)
}

// ... one wrapper per command
```

Thin wrappers are worth having: they give you a single place to add logging,
error transformation, or optimistic UI updates without scattering `invoke`
calls through components.

---

## Progress Reporting (design, implement later)

ffmpeg writes progress to stderr in lines like:
```
frame=  120 fps= 30 q=-1.0 size=    512kB time=00:00:04.00 bitrate=1048.6kbits/s
```

The approach:
1. Spawn ffmpeg with `tauri-plugin-shell`'s streaming API
2. Parse stderr lines in Rust as they arrive
3. Emit a Tauri event (`ffmpeg://progress`) with a typed payload
4. Frontend listens with `listen("ffmpeg://progress", handler)`

This is deferred to a later step — for now, await completion and return
success/error.

---

## Verification Plan

After implementation, the following should work in sequence:

1. **Binary detection** — app starts without panic; Rust logs ffmpeg version
   via `ffmpeg -version` on startup (debug build only)

2. **File picker** — clicking "Open" triggers the native dialog and returns
   a valid path string to the frontend

3. **Trim operation** — given a real video file, `trimVideo({...})` returns
   without error and the output file exists on disk with the expected duration

4. **Error surface** — passing a non-existent input path returns a typed
   `FfmpegError.ProcessFailed` that the frontend can display

---

## Open Questions

- [ ] Should `run_ffmpeg` be async (tokio) or sync + spawned thread?
      Async is cleaner with Tauri's async command support (`async fn` commands
      require `tauri::async_runtime`). Prefer async.
- [ ] Temp file location for merge list file — use `std::env::temp_dir()`?
- [ ] Should output path be chosen by the user (dialog) or auto-generated
      next to the input? Probably dialog for explicit control.
