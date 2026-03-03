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

The input file picker and video preview are **shared** across all operations.
Each tab has its own controls, output path, and run button.

---

## Component Tree

```
App
├── VideoPreview            — <video> element, shows selected input file
├── InputFilePicker         — [Open File] button + path display
├── Tabs (Kobalte)          — operation selector
│   ├── TrimPanel           — start/end inputs
│   ├── ExtractFramePanel   — timestamp input
│   ├── RemuxPanel          — (just output path)
│   ├── StripAudioPanel     — (just output path)
│   └── MergePanel          — multi-file list + add/remove
├── OutputSection           — [Save As] + overwrite checkbox + run button
└── StatusMessage           — success/error display
```

### File structure

```
src/
├── App.tsx                 — layout shell, shared state
├── App.css                 — global styles (Tailwind)
├── lib/
│   └── ffmpeg.ts           — invoke wrappers (exists)
└── components/
    ├── VideoPreview.tsx
    ├── InputFilePicker.tsx
    ├── OutputSection.tsx
    ├── StatusMessage.tsx
    ├── TrimPanel.tsx
    ├── ExtractFramePanel.tsx
    ├── RemuxPanel.tsx
    ├── StripAudioPanel.tsx
    └── MergePanel.tsx
```

---

## Shared State Design

All state lives in `App.tsx` and is passed as props. No global store needed —
the app is small enough that prop drilling is simpler than a state manager.

```typescript
// Shared across all operations
const [inputPath, setInputPath] = createSignal<string | null>(null)
const [inputUrl, setInputUrl] = createSignal<string | null>(null)  // convertFileSrc() for <video>
const [overwrite, setOverwrite] = createSignal(false)
const [status, setStatus] = createSignal<Status>({ kind: "idle" })

// Per-operation state
const [activeTab, setActiveTab] = createSignal<Operation>("trim")
const [trimStart, setTrimStart] = createSignal(0)
const [trimEnd, setTrimEnd] = createSignal(10)
const [extractAt, setExtractAt] = createSignal(0)
const [mergeInputs, setMergeInputs] = createSignal<string[]>([])

// Output path — each operation auto-generates a default
const [outputPath, setOutputPath] = createSignal<string | null>(null)
```

---

## Video Preview

Use `convertFileSrc()` from `@tauri-apps/api/core` to convert a local file
path to a Tauri asset URL that `<video>` can load.

```typescript
import { convertFileSrc } from "@tauri-apps/api/core"

// When user picks an input file:
const url = convertFileSrc(path)
setInputUrl(url)
```

The `<video>` element:
- `controls` — native browser playback controls
- `preload="metadata"` — load duration without buffering entire file
- Listen to `onLoadedMetadata` to auto-set trim end to video duration

**Capability needed**: The Tauri asset protocol must be allowed. Check if
`core:default` already covers this — it should in Tauri v2.

---

## Operation Panels

### TrimPanel
- Start (s) number input
- End (s) number input
- Auto-set end to video duration on file load
- Output default: `{base}_trimmed{ext}`
- Calls `trimVideo()`

### ExtractFramePanel
- Timestamp (s) number input
- Output default: `{base}_frame{ext → .jpg}`
- Calls `extractFrame()`

### RemuxPanel
- Target format selector (MP4 / MKV / WebM)
- Output default: `{base}.{selected_ext}`
- Calls `remux()`

### StripAudioPanel
- No extra inputs — just input and output
- Output default: `{base}_noaudio{ext}`
- Calls `stripAudio()`

### MergePanel
- File list with [Add File] button (opens picker) and [Remove] per item
- Output default: `merged_output.mp4`
- Calls `mergeClips()`
- NOTE: merge uses its own input list, not the shared input file

---

## Kobalte Usage

Use `@kobalte/core` for the tab component — it handles keyboard navigation
(arrow keys), ARIA roles, and focus management correctly.

```tsx
import { Tabs } from "@kobalte/core/tabs"

<Tabs value={activeTab()} onChange={setActiveTab}>
  <Tabs.List>
    <Tabs.Trigger value="trim">Trim</Tabs.Trigger>
    <Tabs.Trigger value="extract">Extract Frame</Tabs.Trigger>
    <Tabs.Trigger value="remux">Remux</Tabs.Trigger>
    <Tabs.Trigger value="strip-audio">Strip Audio</Tabs.Trigger>
    <Tabs.Trigger value="merge">Merge</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="trim"><TrimPanel ... /></Tabs.Content>
  ...
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

## Auto-Generated Output Paths

When the user picks an input file OR switches tabs, auto-generate a sensible
default output path:

```typescript
function defaultOutputPath(input: string, operation: Operation): string {
  const base = input.replace(/\.[^/.]+$/, "")
  const ext = input.match(/\.[^/.]+$/)?.[0] ?? ".mp4"
  switch (operation) {
    case "trim": return `${base}_trimmed${ext}`
    case "extract": return `${base}_frame.jpg`
    case "remux": return `${base}.mp4`  // or selected format
    case "strip-audio": return `${base}_noaudio${ext}`
    case "merge": return `${base}_merged${ext}`
  }
}
```

---

## Implementation Order

```
Step 1  — Create components/ directory
Step 2  — VideoPreview component (convertFileSrc + <video>)
Step 3  — InputFilePicker component (extract from App.tsx)
Step 4  — StatusMessage component (extract from App.tsx)
Step 5  — OutputSection component (Save As + overwrite + run button)
Step 6  — TrimPanel (migrate existing trim controls)
Step 7  — Kobalte Tabs in App.tsx to switch panels
Step 8  — ExtractFramePanel
Step 9  — RemuxPanel
Step 10 — StripAudioPanel
Step 11 — MergePanel (multi-file picker)
Step 12 — Replace inline styles with Tailwind classes
Step 13 — Auto-generate output paths per operation
Step 14 — Wire video duration to trim end default
Step 15 — Verify all 5 operations end-to-end
```

---

## Verification Plan

**Check 1 — Video preview**: Open a video file → preview plays in the app
window with native controls.

**Check 2 — Tab switching**: Click each tab → correct panel shows, output
path auto-updates.

**Check 3 — Trim**: Same as before — trim 0-5s, verify with ffprobe.

**Check 4 — Extract frame**: Set timestamp, extract → output is a JPEG image.

**Check 5 — Remux**: Select MP4→MKV or vice versa → output plays correctly.

**Check 6 — Strip audio**: Strip → verify output has no audio track:
```
ffprobe -v error -select_streams a -show_entries stream=codec_type \
  -of default=noprint_wrappers=1:nokey=1 /path/to/output.mp4
```
Expected: empty output (no audio streams).

**Check 7 — Merge**: Add 2+ files, merge → output duration = sum of inputs.

**Check 8 — Overwrite protection**: All operations respect the checkbox.

**Check 9 — Keyboard navigation**: Tab through the operation tabs with
arrow keys (Kobalte a11y).

---

## Open Questions

| Question | Proposed Decision |
|----------|------------------|
| Should merge panel use the shared input file or its own file list? | **Own file list** — merge is fundamentally multi-file, sharing the single input picker would be confusing |
| Video preview for merge? | **Show first file in merge list**, or hide preview when on merge tab |
| Format selector for remux? | **Simple dropdown**: MP4, MKV, WebM. Default based on input extension. |
