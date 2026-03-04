# Step 3 — Full UI with Video Preview

## Goal

Build out the frontend to expose all five video operations, add a `<video>`
preview of the input file, and break the monolithic `App.tsx` into proper
components. Use the already-installed Tailwind v4 and Kobalte libraries.

---

## Current State

| What | Status |
|------|--------|
| Trim | Backend + UI working |
| Extract frame | Backend only — no UI |
| Remux | Backend only — no UI |
| Strip audio | Backend only — no UI |
| Merge clips | Backend only — no UI |
| Video preview | None |
| Styling | Inline styles, Tailwind imported but unused |
| Components | Everything in `App.tsx` |
| Kobalte | Installed, unused |

---

## UI Layout

```
┌──────────────────────────────────────────────────┐
│  Simple Video Editor                             │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │                                            │  │
│  │           <video> preview                  │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [Open File]  /path/to/input.mp4                 │
│                                                  │
│  ┌──────┬─────────┬───────┬─────────┬───────┐   │
│  │ Trim │ Extract │ Remux │ Strip   │ Merge │   │
│  │      │ Frame   │       │ Audio   │       │   │
│  └──────┴─────────┴───────┴─────────┴───────┘   │
│  ┌────────────────────────────────────────────┐  │
│  │                                            │  │
│  │  (operation-specific controls here)        │  │
│  │                                            │  │
│  │  [Save As]  /path/to/output.mp4            │  │
│  │  ☐ Allow overwrite                         │  │
│  │  [ Run ]                                   │  │
│  │                                            │  │
│  │  Status: Trimmed → /path/to/output.mp4     │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

The input file picker and video preview are **shared** across all operations
(except merge — see below). Each tab has its own controls, output path, and
run button.

---

## Component Tree

```
App
├── VideoPreview            — <video> element, driven by previewPath signal
├── InputFilePicker         — [Open File] button + path display (hidden on merge tab)
├── Tabs (Kobalte)          — operation selector
│   ├── TrimPanel           — start/end inputs + OutputSection
│   ├── ExtractFramePanel   — timestamp input + OutputSection
│   ├── RemuxPanel          — format selector + OutputSection
│   ├── StripAudioPanel     — (no extra inputs) + OutputSection
│   └── MergePanel          — multi-file list (add/remove) + OutputSection
└── StatusMessage           — success/error display (below tabs)
```

`OutputSection` is a reusable component rendered inside each panel:
```
OutputSection
  [Save As]  /path/to/output.mp4
  ☐ Allow overwrite
  [ Run ]
```

---

## File Structure

```
src/
├── App.tsx                      — layout shell, shared state, tab orchestration
├── App.css                      — global styles (Tailwind)
├── index.tsx                    — entry point (unchanged)
├── vite-env.d.ts                — (unchanged)
├── types.ts                     — Operation, Status, RemuxFormat types
├── lib/
│   ├── ffmpeg.ts                — invoke wrappers, FfmpegError type, formatFfmpegError
│   └── paths.ts                 — defaultOutputPath helper
└── components/
    ├── VideoPreview.tsx
    ├── InputFilePicker.tsx
    ├── OutputSection.tsx        — Save As + overwrite + run button (shared)
    ├── StatusMessage.tsx
    ├── TrimPanel.tsx
    ├── ExtractFramePanel.tsx
    ├── RemuxPanel.tsx
    ├── StripAudioPanel.tsx
    └── MergePanel.tsx
```

One component per file. No barrel/index files needed at this size.

---

## Types (`src/types.ts`)

```typescript
export type Operation = "trim" | "extract" | "remux" | "strip-audio" | "merge"

export type RemuxFormat = "mp4" | "mkv" | "webm"

export type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string }
```

---

## Shared State Design (`App.tsx`)

```typescript
// Shared across all operations
const [inputPath, setInputPath] = createSignal<string | null>(null)
const [previewPath, setPreviewPath] = createSignal<string | null>(null)  // drives <video>
const [overwrite, setOverwrite] = createSignal(false)
const [status, setStatus] = createSignal<Status>({ kind: "idle" })
const [activeTab, setActiveTab] = createSignal<Operation>("trim")

// Derived: asset URL for <video> element
const previewUrl = createMemo(() =>
  previewPath() ? convertFileSrc(previewPath()!) : null
)
```

Each panel manages its **own** output path as local state (not in App).
This keeps panels self-contained and avoids a `Record<Operation, string>`
map at the top level.

### Tab change handler

```typescript
function handleTabChange(tab: Operation) {
  setActiveTab(tab as Operation)
  setStatus({ kind: "idle" })   // clear status on every tab switch
  if (tab !== "merge") {
    setPreviewPath(inputPath())  // restore preview to shared input file
  }
  // merge tab: MergePanel controls previewPath via onPreviewChange
}
```

### Input file pick handler

```typescript
async function handlePickInput() {
  const path = await pickInputFile()
  if (path !== null) {
    setInputPath(path)
    setPreviewPath(path)
  }
}
```

---

## Panel Props Contracts

Each panel receives the minimum it needs. No panel gets props it doesn't use.

### TrimPanel
```typescript
interface TrimPanelProps {
  inputPath: Accessor<string | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}
```
Internal state: `outputPath`, `startSecs`, `endSecs`

### ExtractFramePanel
```typescript
interface ExtractFramePanelProps {
  inputPath: Accessor<string | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}
```
Internal state: `outputPath`, `atSecs`

### RemuxPanel
```typescript
interface RemuxPanelProps {
  inputPath: Accessor<string | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}
```
Internal state: `outputPath`, `format: RemuxFormat`

When `format` changes → auto-update `outputPath` extension.

### StripAudioPanel
```typescript
interface StripAudioPanelProps {
  inputPath: Accessor<string | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}
```
Internal state: `outputPath`

### MergePanel
```typescript
interface MergePanelProps {
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
  onPreviewChange: (path: string | null) => void  // updates App's previewPath
}
```
Internal state: `outputPath`, `mergeInputs: string[]`

No `inputPath` prop — merge uses its own file list.

### OutputSection
```typescript
interface OutputSectionProps {
  outputPath: Accessor<string | null>
  onPickOutput: () => void
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  onRun: () => void
  isRunning: Accessor<boolean>
  runLabel: string          // e.g. "Trim", "Extract", "Merge"
}
```

---

## Video Preview

Use `convertFileSrc()` from `@tauri-apps/api/core` to convert a local file
path to a Tauri asset URL that `<video>` can load.

```typescript
import { convertFileSrc } from "@tauri-apps/api/core"

const previewUrl = createMemo(() =>
  previewPath() ? convertFileSrc(previewPath()!) : null
)
```

The `<video>` element:
- `controls` — native browser playback controls
- `preload="metadata"` — load duration without buffering entire file
- Hidden (not rendered) when `previewUrl()` is null
- Listen to `onLoadedMetadata` to auto-set trim end to video duration
  (VideoPreview calls an optional `onDuration` callback)

**Capability needed**: The Tauri asset protocol must be allowed. Check if
`core:default` already covers this — it should in Tauri v2.

### Merge tab preview behaviour

The merge tab does not use the shared `inputPath`. The `previewPath` signal
is instead controlled by MergePanel:

| Merge list state | Preview shown |
|------------------|---------------|
| Empty | Hidden (null) |
| Has ≥ 1 file | First file in the list |
| After successful merge | The merged output file |

When the user navigates away from the merge tab, `handleTabChange` restores
`previewPath` to `inputPath()`.

---

## Operation Panels

### TrimPanel
- Start (s) number input, min 0, step 0.1
- End (s) number input, min 0, step 0.1
- Auto-set end to video duration when `onDuration` fires from VideoPreview
- Output default: `{base}_trimmed{ext}`
- Calls `trimVideo()`

### ExtractFramePanel
- Timestamp (s) number input, min 0, step 0.1
- Output default: `{base}_frame.jpg` (always `.jpg`)
- Calls `extractFrame()`

### RemuxPanel
- Target format selector: MP4 / MKV / WebM (Kobalte `Select` or native `<select>`)
- Default format: `mp4`
- Output default: `{base}.{format}` — **updates live as format changes**
- Calls `remux()`

### StripAudioPanel
- No extra inputs — just output path
- Output default: `{base}_noaudio{ext}`
- Calls `stripAudio()`

### MergePanel
- File list: each entry shows the filename, with a [Remove] button
- [Add Files] button — opens a **multi-select** file picker
- Output default: `{dir_of_first_file}/merged_output.mp4`, or
  `merged_output.mp4` if the list is empty
- Calls `mergeClips()`
- After success: calls `onPreviewChange(outputPath)` to show the result
- On list change: calls `onPreviewChange(mergeInputs[0] ?? null)`

---

## Validation Rules

Every panel validates before calling ffmpeg. On failure, call
`setStatus({ kind: "error", message: "..." })` and return early.

| Panel | Validation rules |
|-------|-----------------|
| All | Input file must be selected (not needed for merge) |
| All | Output path must be set |
| Trim | `startSecs >= 0` |
| Trim | `endSecs > startSecs` ("End must be after start") |
| Extract | `atSecs >= 0` |
| Remux | (none beyond the shared rules) |
| Strip Audio | (none beyond the shared rules) |
| Merge | At least 2 files in the list ("Add at least 2 files to merge") |
| Merge | Output path must be set |

---

## Multi-Select File Picker (new Rust command)

The existing `pick_input_file` opens a single-file dialog. Merge needs
multi-select. Add a new Rust command:

```rust
// src-tauri/src/commands.rs
#[tauri::command]
pub async fn pick_input_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let paths = app
        .dialog()
        .file()
        .add_filter(
            "Video files",
            &["mp4", "mkv", "mov", "avi", "webm", "m4v", "ts", "mts"],
        )
        .blocking_pick_files();
    Ok(paths
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.to_string())
        .collect())
}
```

Register it in `lib.rs` alongside the other commands, and add a wrapper in
`src/lib/ffmpeg.ts`:

```typescript
export async function pickInputFiles(): Promise<string[]> {
  return invoke<string[]>("pick_input_files")
}
```

---

## Auto-Generated Output Paths (`src/lib/paths.ts`)

```typescript
import type { Operation, RemuxFormat } from "../types"

export function defaultOutputPath(
  input: string,
  operation: Exclude<Operation, "merge">,
  remuxFormat?: RemuxFormat,
): string {
  const base = input.replace(/\.[^/.]+$/, "")
  const ext = input.match(/\.[^/.]+$/)?.[0] ?? ".mp4"
  switch (operation) {
    case "trim":        return `${base}_trimmed${ext}`
    case "extract":     return `${base}_frame.jpg`
    case "remux":       return `${base}.${remuxFormat ?? "mp4"}`
    case "strip-audio": return `${base}_noaudio${ext}`
  }
}

export function defaultMergeOutputPath(firstInput: string | null): string {
  if (!firstInput) return "merged_output.mp4"
  const dir = firstInput.includes("/")
    ? firstInput.slice(0, firstInput.lastIndexOf("/"))
    : "."
  return `${dir}/merged_output.mp4`
}
```

Panels call these on mount and whenever relevant inputs change.

---

## `formatFfmpegError` — move to `lib/ffmpeg.ts`

Currently defined inline in `App.tsx`. Move it to `src/lib/ffmpeg.ts` and
export it. All panels import it from there.

```typescript
export function formatFfmpegError(err: unknown): string {
  if (typeof err === "string") return err
  if (err !== null && typeof err === "object") {
    const obj = err as FfmpegError
    if ("UserError" in obj) return obj.UserError
    if ("ProcessFailed" in obj) {
      console.error("ffmpeg stderr:", obj.ProcessFailed.stderr)
      return `ffmpeg failed (exit code ${obj.ProcessFailed.code.toString()})`
    }
    if ("NotFound" in obj) return "ffmpeg not found on PATH."
    if ("Io" in obj) return `IO error: ${obj.Io}`
  }
  return String(err)
}
```

---

## Kobalte Usage

Use `@kobalte/core` for the tab component — it handles keyboard navigation
(arrow keys), ARIA roles, and focus management correctly.

```tsx
import { Tabs } from "@kobalte/core/tabs"

<Tabs value={activeTab()} onChange={handleTabChange}>
  <Tabs.List>
    <Tabs.Trigger value="trim">Trim</Tabs.Trigger>
    <Tabs.Trigger value="extract">Extract Frame</Tabs.Trigger>
    <Tabs.Trigger value="remux">Remux</Tabs.Trigger>
    <Tabs.Trigger value="strip-audio">Strip Audio</Tabs.Trigger>
    <Tabs.Trigger value="merge">Merge</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="trim"><TrimPanel ... /></Tabs.Content>
  <Tabs.Content value="extract"><ExtractFramePanel ... /></Tabs.Content>
  <Tabs.Content value="remux"><RemuxPanel ... /></Tabs.Content>
  <Tabs.Content value="strip-audio"><StripAudioPanel ... /></Tabs.Content>
  <Tabs.Content value="merge"><MergePanel ... /></Tabs.Content>
</Tabs>
```

Style the tab triggers and content panels with Tailwind utility classes.

---

## Tailwind v4 Migration

The app already imports Tailwind (`@import "tailwindcss"` in App.css).
Replace inline `style=` attributes with Tailwind classes.

Example migration:
```
BEFORE: style="display:flex;gap:8px;align-items:center"
AFTER:  class="flex items-center gap-2"
```

Keep custom CSS in App.css only for things Tailwind can't handle (like the
`:root` color scheme variables that are already there).

---

## Implementation Order

```
Step  1 — Add types.ts (Operation, Status, RemuxFormat)
Step  2 — Add lib/paths.ts (defaultOutputPath, defaultMergeOutputPath)
Step  3 — Move formatFfmpegError to lib/ffmpeg.ts; add pickInputFiles command
           (Rust: pick_input_files command + register in lib.rs)
           (TS: pickInputFiles wrapper in ffmpeg.ts)
Step  4 — VideoPreview component (previewUrl prop + optional onDuration callback)
Step  5 — InputFilePicker component (inputPath display + onPick callback)
Step  6 — StatusMessage component
Step  7 — OutputSection component (Save As + overwrite checkbox + run button)
Step  8 — TrimPanel (migrate existing trim controls, use OutputSection)
Step  9 — Wire App.tsx: Kobalte Tabs + shared state + handleTabChange
Step 10 — ExtractFramePanel
Step 11 — RemuxPanel (format selector drives output path)
Step 12 — StripAudioPanel
Step 13 — MergePanel (multi-file list + preview wiring)
Step 14 — Replace all inline styles with Tailwind classes
Step 15 — Verify all 5 operations end-to-end (see Verification Plan)
```

---

## Verification Plan

**Check 1 — Video preview**: Open a video file → preview plays in the app
window with native controls.

**Check 2 — Tab switching**: Click each tab → correct panel shows, output
path auto-updates, status clears.

**Check 3 — Trim**: Trim 0–5s → verify duration with ffprobe.

**Check 4 — Extract frame**: Set timestamp, extract → output is a JPEG image.

**Check 5 — Remux**: Select MP4→MKV → output plays correctly; changing the
format dropdown updates the output path extension live.

**Check 6 — Strip audio**: Strip → verify output has no audio track:
```
ffprobe -v error -select_streams a -show_entries stream=codec_type \
  -of default=noprint_wrappers=1:nokey=1 /path/to/output.mp4
```
Expected: empty output (no audio streams).

**Check 7 — Merge**: Add 2+ files, merge → output duration = sum of inputs;
preview shows merged result after completion.

**Check 8 — Merge preview**: Add first file to merge list → preview updates
to show it; remove all files → preview hides; switch away from merge tab →
preview shows the shared input file again.

**Check 9 — Overwrite protection**: All operations respect the checkbox.

**Check 10 — Keyboard navigation**: Tab through the operation tabs with
arrow keys (Kobalte a11y).
