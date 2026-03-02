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
  #[tauri::command] trim_video(app: tauri::AppHandle, ...)
      │
      ▼
src-tauri/src/ffmpeg.rs
  run_ffmpeg(app: &tauri::AppHandle, args: Vec<String>) -> Result<(), FfmpegError>
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

## Open Questions — Resolved

| Question | Decision |
|---|---|
| `run_ffmpeg` async or sync? | **async** — Tauri v2 native async command support, no thread management needed |
| Temp file for merge concat list? | `std::env::temp_dir().join("sve_ffmpeg_concat.txt")`, write before spawn, delete after (regardless of success) |
| Output path — dialog or auto? | **User dialog** via `tauri-plugin-dialog` `blocking_save_file()` |

---

## Implementation Order

```
Step 1 — Cargo.toml: add 4 new crates
Step 2 — npm: install 3 plugin packages
Step 3 — tauri.conf.json: add shell plugin scope
Step 4 — capabilities/default.json: add shell/dialog/fs permissions
Step 5 — src-tauri/src/ffmpeg.rs: new file (error type + run_ffmpeg + 5 arg builders + unit tests)
Step 6 — src-tauri/src/commands.rs: new file (5 video commands + 2 file picker commands)
Step 7 — src-tauri/src/lib.rs: full replacement (register plugins + all 7 commands)
Step 8 — src/lib/ffmpeg.ts: new file (TS interfaces + 7 invoke wrappers)
Step 9 — src/App.tsx: replace with minimal trim UI
Step 10 — Verify (4-step smoke test)
```

---

## Packages to Install

### Rust — `src-tauri/Cargo.toml`

Add under `[dependencies]`:

```toml
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
thiserror = "2"
```

`thiserror` is already in the transitive dependency graph so no version conflict.

### Frontend

```
pnpm add @tauri-apps/plugin-shell @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

---

## Capability / Permissions

### `src-tauri/capabilities/default.json` (full replacement)

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
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

### `tauri.conf.json` — shell scope (add `"plugins"` top-level key)

`shell:allow-execute` must be scoped to only permit the ffmpeg binary
(prevents arbitrary shell execution):

```json
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
```

`"args": true` — required because arg lists are dynamic.
Phase 2: change to `"sidecar": true`.

---

## Rust Module Structure

```
src-tauri/src/
├── main.rs          — entry point, unchanged
├── lib.rs           — plugin registration, invoke_handler
├── commands.rs      — #[tauri::command] handlers (thin)
└── ffmpeg.rs        — all ffmpeg invocation logic
```

### `src-tauri/src/lib.rs` (full replacement)

Plugin order matters: `tauri_plugin_shell` must be registered before any
command calls `app.shell()`.

```rust
mod commands;
mod ffmpeg;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::trim_video,
            commands::extract_frame,
            commands::remux,
            commands::strip_audio,
            commands::merge_clips,
            commands::pick_input_file,
            commands::pick_output_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### `src-tauri/src/ffmpeg.rs` (new file)

**Design notes:**
- `run_ffmpeg` accepts `&tauri::AppHandle` — required by the `ShellExt` trait
- Arg builders return `Vec<String>` (not `Vec<&str>`) — numeric timestamps
  must be formatted to owned `String`s first; lifetime juggling would make
  the builders awkward
- `FfmpegError::Io` wraps `String`, not `std::io::Error` — `std::io::Error`
  is not `serde::Serialize`, so we use a manual `From` impl that converts
  the error to its string representation

```rust
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum FfmpegError {
    #[error("ffmpeg process failed (exit {code}): {stderr}")]
    ProcessFailed { code: i32, stderr: String },

    #[error("ffmpeg not found on PATH")]
    NotFound,

    #[error("io error: {0}")]
    Io(String),
}

impl From<std::io::Error> for FfmpegError {
    fn from(e: std::io::Error) -> Self {
        FfmpegError::Io(e.to_string())
    }
}

pub async fn run_ffmpeg(app: &tauri::AppHandle, args: Vec<String>) -> Result<(), FfmpegError> {
    let (mut rx, _child) = app
        .shell()
        .command("ffmpeg")
        .args(args)
        .spawn()
        .map_err(|e| FfmpegError::Io(e.to_string()))?;

    let mut stderr_buf = String::new();
    let mut exit_code: i32 = -1;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line) => {
                stderr_buf.push_str(&String::from_utf8_lossy(&line));
                stderr_buf.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code.unwrap_or(-1);
            }
            _ => {}
        }
    }

    if exit_code != 0 {
        return Err(FfmpegError::ProcessFailed { code: exit_code, stderr: stderr_buf });
    }
    Ok(())
}

// ── Arg builders ────────────────────────────────────────────────────────────
// Pure functions, no I/O — unit-testable without a real ffmpeg binary.

/// `-ss`/`-to` placed BEFORE `-i` for fast input-seeking (keyframe-accurate seek).
pub fn trim_args(input: &str, output: &str, start_secs: f64, end_secs: f64) -> Vec<String> {
    vec![
        "-y".into(), "-ss".into(), format!("{start_secs:.6}"),
        "-to".into(), format!("{end_secs:.6}"),
        "-i".into(), input.to_owned(), "-c".into(), "copy".into(), output.to_owned(),
    ]
}

pub fn extract_frame_args(input: &str, output: &str, at_secs: f64) -> Vec<String> {
    vec![
        "-y".into(), "-ss".into(), format!("{at_secs:.6}"),
        "-i".into(), input.to_owned(), "-vframes".into(), "1".into(), output.to_owned(),
    ]
}

pub fn remux_args(input: &str, output: &str) -> Vec<String> {
    vec!["-y".into(), "-i".into(), input.to_owned(), "-c".into(), "copy".into(), output.to_owned()]
}

/// Strips all audio tracks. `-an` removes audio; video stream is copied losslessly.
pub fn strip_audio_args(input: &str, output: &str) -> Vec<String> {
    vec![
        "-y".into(), "-i".into(), input.to_owned(),
        "-c:v".into(), "copy".into(), "-an".into(), output.to_owned(),
    ]
}

/// `list_file` must already exist and follow concat-demuxer format:
/// ```
/// file '/absolute/path/to/clip1.mp4'
/// file '/absolute/path/to/clip2.mp4'
/// ```
/// `-safe 0` is required when paths are absolute.
pub fn merge_args(list_file: &str, output: &str) -> Vec<String> {
    vec![
        "-y".into(), "-f".into(), "concat".into(), "-safe".into(), "0".into(),
        "-i".into(), list_file.to_owned(), "-c".into(), "copy".into(), output.to_owned(),
    ]
}

// ── Unit tests ───────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_args_ss_before_i() {
        let args = trim_args("/in.mp4", "/out.mp4", 10.0, 30.5);
        let ss_pos = args.iter().position(|a| a == "-ss").unwrap();
        let i_pos = args.iter().position(|a| a == "-i").unwrap();
        assert!(ss_pos < i_pos, "-ss must precede -i for fast seek");
    }

    #[test]
    fn trim_args_timestamps_formatted() {
        let args = trim_args("/in.mp4", "/out.mp4", 10.5, 30.25);
        let ss_idx = args.iter().position(|a| a == "-ss").unwrap();
        assert_eq!(args[ss_idx + 1], "10.500000");
    }

    #[test]
    fn strip_audio_args_has_an() {
        assert!(strip_audio_args("/in.mp4", "/out.mp4").contains(&"-an".to_string()));
    }

    #[test]
    fn merge_args_has_safe_flag() {
        let args = merge_args("/tmp/list.txt", "/out.mp4");
        let safe_pos = args.iter().position(|a| a == "-safe").unwrap();
        assert_eq!(args[safe_pos + 1], "0");
    }
}
```

### `src-tauri/src/commands.rs` (new file)

```rust
use tauri_plugin_dialog::DialogExt;
use crate::ffmpeg::{self, FfmpegError};

#[tauri::command]
pub async fn trim_video(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    start_secs: f64,
    end_secs: f64,
) -> Result<(), FfmpegError> {
    ffmpeg::run_ffmpeg(&app, ffmpeg::trim_args(&input_path, &output_path, start_secs, end_secs)).await
}

#[tauri::command]
pub async fn extract_frame(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    at_secs: f64,
) -> Result<(), FfmpegError> {
    ffmpeg::run_ffmpeg(&app, ffmpeg::extract_frame_args(&input_path, &output_path, at_secs)).await
}

#[tauri::command]
pub async fn remux(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
) -> Result<(), FfmpegError> {
    ffmpeg::run_ffmpeg(&app, ffmpeg::remux_args(&input_path, &output_path)).await
}

#[tauri::command]
pub async fn strip_audio(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
) -> Result<(), FfmpegError> {
    ffmpeg::run_ffmpeg(&app, ffmpeg::strip_audio_args(&input_path, &output_path)).await
}

#[tauri::command]
pub async fn merge_clips(
    app: tauri::AppHandle,
    input_paths: Vec<String>,
    output_path: String,
) -> Result<(), FfmpegError> {
    let list_path = std::env::temp_dir().join("sve_ffmpeg_concat.txt");
    let list_content: String = input_paths
        .iter()
        .map(|p| format!("file '{}'\n", p.replace('\'', "'\\''")))
        .collect();
    std::fs::write(&list_path, list_content).map_err(|e| FfmpegError::Io(e.to_string()))?;
    let list_str = list_path.to_string_lossy().into_owned();
    let result = ffmpeg::run_ffmpeg(&app, ffmpeg::merge_args(&list_str, &output_path)).await;
    let _ = std::fs::remove_file(&list_path); // clean up regardless of success
    result
}

#[tauri::command]
pub async fn pick_input_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Video files", &["mp4", "mkv", "mov", "avi", "webm", "m4v", "ts", "mts"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_output_file(
    app: tauri::AppHandle,
    default_name: String,
) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(path.map(|p| p.to_string()))
}
```

---

## TypeScript IPC Layer

### `src/lib/ffmpeg.ts` (new file, new `src/lib/` directory)

**Critical**: `invoke()` keys must be **`snake_case`** — they must match Rust
parameter names exactly. Tauri v2 does not auto-rename camelCase.

```typescript
import { invoke } from "@tauri-apps/api/core"

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

// Mirrors the FfmpegError Rust enum (serde serialises as tagged variants)
export type FfmpegError =
  | { ProcessFailed: { code: number; stderr: string } }
  | { NotFound: null }
  | { Io: string }

export async function trimVideo(opts: TrimOptions): Promise<void> {
  return invoke("trim_video", {
    input_path: opts.inputPath,
    output_path: opts.outputPath,
    start_secs: opts.startSecs,
    end_secs: opts.endSecs,
  })
}

export async function extractFrame(opts: ExtractFrameOptions): Promise<void> {
  return invoke("extract_frame", {
    input_path: opts.inputPath,
    output_path: opts.outputPath,
    at_secs: opts.atSecs,
  })
}

export async function remux(opts: RemuxOptions): Promise<void> {
  return invoke("remux", {
    input_path: opts.inputPath,
    output_path: opts.outputPath,
  })
}

export async function stripAudio(opts: StripAudioOptions): Promise<void> {
  return invoke("strip_audio", {
    input_path: opts.inputPath,
    output_path: opts.outputPath,
  })
}

export async function mergeClips(opts: MergeOptions): Promise<void> {
  return invoke("merge_clips", {
    input_paths: opts.inputPaths,
    output_path: opts.outputPath,
  })
}

export async function pickInputFile(): Promise<string | null> {
  return invoke<string | null>("pick_input_file")
}

export async function pickOutputFile(defaultName: string): Promise<string | null> {
  return invoke<string | null>("pick_output_file", { default_name: defaultName })
}
```

Thin wrappers are worth having: they give you a single place to add logging,
error transformation, or optimistic UI updates without scattering `invoke`
calls through components.

---

## Minimal Trim UI — `src/App.tsx` (replacement)

Replaces the default template with the simplest UI that exercises the full
trim flow end-to-end:

```tsx
import { createSignal } from "solid-js"
import { pickInputFile, pickOutputFile, trimVideo } from "./lib/ffmpeg"
import type { FfmpegError } from "./lib/ffmpeg"
import "./App.css"

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string }

function formatFfmpegError(err: FfmpegError): string {
  if ("ProcessFailed" in err)
    return `ffmpeg exited ${err.ProcessFailed.code.toString()}:\n${err.ProcessFailed.stderr}`
  if ("NotFound" in err) return "ffmpeg not found on PATH."
  if ("Io" in err) return `IO error: ${err.Io}`
  return "Unknown error"
}

function App() {
  const [inputPath, setInputPath] = createSignal<string | null>(null)
  const [outputPath, setOutputPath] = createSignal<string | null>(null)
  const [startSecs, setStartSecs] = createSignal(0)
  const [endSecs, setEndSecs] = createSignal(10)
  const [status, setStatus] = createSignal<Status>({ kind: "idle" })

  async function handlePickInput() {
    const path = await pickInputFile()
    if (path !== null) {
      setInputPath(path)
      const base = path.replace(/\.[^/.]+$/, "")
      const ext = path.match(/\.[^/.]+$/)?.[0] ?? ".mp4"
      setOutputPath(`${base}_trimmed${ext}`)
    }
  }

  async function handlePickOutput() {
    const current = outputPath()
    const defaultName = current
      ? (current.split("/").at(-1) ?? "output.mp4")
      : "output.mp4"
    const path = await pickOutputFile(defaultName)
    if (path !== null) setOutputPath(path)
  }

  async function handleTrim() {
    const inp = inputPath()
    const out = outputPath()
    if (!inp || !out) {
      setStatus({ kind: "error", message: "Select input and output files first." })
      return
    }
    if (endSecs() <= startSecs()) {
      setStatus({ kind: "error", message: "End must be greater than start." })
      return
    }
    setStatus({ kind: "running" })
    try {
      await trimVideo({ inputPath: inp, outputPath: out, startSecs: startSecs(), endSecs: endSecs() })
      setStatus({ kind: "ok", message: `Trimmed → ${out}` })
    } catch (err: unknown) {
      setStatus({ kind: "error", message: formatFfmpegError(err as FfmpegError) })
    }
  }

  return (
    <main class="container">
      <h1>Simple Video Editor</h1>
      <section style="display:flex;flex-direction:column;gap:12px;max-width:600px;margin:0 auto">
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" onClick={() => void handlePickInput()}>Open File</button>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.875rem">
            {inputPath() ?? "No file selected"}
          </span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" onClick={() => void handlePickOutput()}>Save As</button>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.875rem">
            {outputPath() ?? "No output path set"}
          </span>
        </div>
        <div style="display:flex;gap:16px;align-items:center">
          <label>
            Start (s)
            <input
              type="number" min="0" step="0.1" value={startSecs()}
              onInput={(e) => setStartSecs(parseFloat(e.currentTarget.value))}
              style="width:80px;margin-left:8px"
            />
          </label>
          <label>
            End (s)
            <input
              type="number" min="0" step="0.1" value={endSecs()}
              onInput={(e) => setEndSecs(parseFloat(e.currentTarget.value))}
              style="width:80px;margin-left:8px"
            />
          </label>
        </div>
        <button type="button" disabled={status().kind === "running"} onClick={() => void handleTrim()}>
          {status().kind === "running" ? "Trimming…" : "Trim"}
        </button>
        {status().kind !== "idle" && (
          <p style={`white-space:pre-wrap;font-size:.875rem;color:${
            status().kind === "error" ? "#c0392b"
            : status().kind === "ok" ? "#27ae60"
            : "#555"
          }`}>
            {status().kind === "running"
              ? "Running…"
              : "message" in status()
                ? (status() as { kind: "ok" | "error"; message: string }).message
                : ""}
          </p>
        )}
      </section>
    </main>
  )
}

export default App
```

**ESLint notes:**
- `void` prefix on async event handlers satisfies `@typescript-eslint/no-floating-promises`
- `import type` for `FfmpegError` is required by `verbatimModuleSyntax` in `tsconfig.json`

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

Run `pnpm tauri dev` after all changes.

**Check 1 — App starts**: Window shows "Simple Video Editor". No startup panic
= plugins registered correctly.

**Check 2 — File picker works**: Click "Open File" → native OS dialog appears
→ select a video → path shows in UI. If dialog doesn't open: check
`dialog:allow-open` in capabilities and `tauri_plugin_dialog::init()` in
`lib.rs`.

**Check 3 — Trim produces correct output**:
1. Open a video longer than 10 s. Set Start=0, End=5. Click "Save As", pick
   a location. Click "Trim".
2. After success message, verify in terminal:
   ```
   ffprobe -v error -show_entries format=duration \
     -of default=noprint_wrappers=1:nokey=1 /path/to/output.mp4
   ```
   Expected: ~`5.000000` (±1 s due to keyframe alignment with `-c copy`).

**Check 4 — Error serialises to frontend**:
In DevTools console:
```javascript
window.__TAURI__.core.invoke("trim_video", {
  input_path: "/nonexistent.mp4",
  output_path: "/tmp/out.mp4",
  start_secs: 0,
  end_secs: 5,
})
```
Expected rejection: `{ "ProcessFailed": { "code": 1, "stderr": "No such file…" } }`

---

## Common Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| IPC error / command not found | Command missing from `generate_handler![]` | Add to `lib.rs` |
| Dialog opens, path is always `None` | `dialog:allow-open` missing | Add to capabilities |
| ffmpeg spawn permission error | `shell:allow-execute` missing or scope wrong | Check capabilities + `tauri.conf.json` |
| `app.shell()` method not found | `ShellExt` trait not imported | `use tauri_plugin_shell::ShellExt;` |
| Rust compile error on `FfmpegError` | `std::io::Error` is not `Serialize` | Use manual `From` impl converting to `String` |
| TypeScript invoke params silently ignored | camelCase vs snake_case mismatch | Use `snake_case` keys in all `invoke()` calls |
