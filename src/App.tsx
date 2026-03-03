import { createSignal } from "solid-js"
import type { FfmpegError } from "./lib/ffmpeg"
import { pickInputFile, pickOutputFile, trimVideo } from "./lib/ffmpeg"
import "./App.css"

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string }

function formatFfmpegError(err: unknown): string {
  // Tauri v2 may send errors as strings (via Display) or as serialized objects
  if (typeof err === "string") return err
  if (err !== null && typeof err === "object") {
    const obj = err as FfmpegError
    if ("ProcessFailed" in obj)
      return `ffmpeg exited ${obj.ProcessFailed.code.toString()}:\n${obj.ProcessFailed.stderr}`
    if ("NotFound" in obj) return "ffmpeg not found on PATH."
    if ("Io" in obj) return `IO error: ${obj.Io}`
  }
  return String(err)
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
      await trimVideo({
        inputPath: inp,
        outputPath: out,
        startSecs: startSecs(),
        endSecs: endSecs(),
      })
      setStatus({ kind: "ok", message: `Trimmed → ${out}` })
    } catch (err: unknown) {
      console.error("[handleTrim] raw error:", err, typeof err)
      setStatus({ kind: "error", message: formatFfmpegError(err) })
    }
  }

  return (
    <main class="container">
      <h1>Simple Video Editor</h1>
      <section style="display:flex;flex-direction:column;gap:12px;max-width:600px;margin:0 auto">
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" onClick={() => void handlePickInput()}>
            Open File
          </button>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.875rem">
            {inputPath() ?? "No file selected"}
          </span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" onClick={() => void handlePickOutput()}>
            Save As
          </button>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.875rem">
            {outputPath() ?? "No output path set"}
          </span>
        </div>
        <div style="display:flex;gap:16px;align-items:center">
          <label>
            Start (s)
            <input
              type="number"
              min="0"
              step="0.1"
              value={startSecs()}
              onInput={(e) => setStartSecs(parseFloat(e.currentTarget.value))}
              style="width:80px;margin-left:8px"
            />
          </label>
          <label>
            End (s)
            <input
              type="number"
              min="0"
              step="0.1"
              value={endSecs()}
              onInput={(e) => setEndSecs(parseFloat(e.currentTarget.value))}
              style="width:80px;margin-left:8px"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={status().kind === "running"}
          onClick={() => void handleTrim()}
        >
          {status().kind === "running" ? "Trimming…" : "Trim"}
        </button>
        {status().kind !== "idle" && (
          <p
            style={`white-space:pre-wrap;font-size:.875rem;color:${
              status().kind === "error"
                ? "#c0392b"
                : status().kind === "ok"
                  ? "#27ae60"
                  : "#555"
            }`}
          >
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
