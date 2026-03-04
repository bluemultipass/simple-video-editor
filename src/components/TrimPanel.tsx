import { createEffect, createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { Status } from "../types"
import { formatFfmpegError, pickOutputFile, trimVideo } from "../lib/ffmpeg"
import { defaultOutputPath } from "../lib/paths"
import OutputSection from "./OutputSection"

interface TrimPanelProps {
  inputPath: Accessor<string | null>
  videoDuration: Accessor<number | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}

export default function TrimPanel(props: TrimPanelProps) {
  const [outputPath, setOutputPath] = createSignal<string | null>(null)
  const [startSecs, setStartSecs] = createSignal(0)
  const [endSecs, setEndSecs] = createSignal(10)
  const [isRunning, setIsRunning] = createSignal(false)

  createEffect(() => {
    const inp = props.inputPath()
    if (inp !== null) setOutputPath(defaultOutputPath(inp, "trim"))
  })

  createEffect(() => {
    const dur = props.videoDuration()
    if (dur !== null) setEndSecs(dur)
  })

  async function handlePickOutput() {
    const current = outputPath()
    const defaultName = current ? (current.split("/").at(-1) ?? "output.mp4") : "output.mp4"
    const path = await pickOutputFile(defaultName)
    if (path !== null) setOutputPath(path)
  }

  async function handleRun() {
    const inp = props.inputPath()
    const out = outputPath()
    if (!inp) {
      props.setStatus({ kind: "error", message: "Select an input file first." })
      return
    }
    if (!out) {
      props.setStatus({ kind: "error", message: "Set an output path first." })
      return
    }
    if (isNaN(startSecs()) || isNaN(endSecs())) {
      props.setStatus({ kind: "error", message: "Enter valid numbers for start and end." })
      return
    }
    if (startSecs() < 0) {
      props.setStatus({ kind: "error", message: "Start must be ≥ 0." })
      return
    }
    if (endSecs() <= startSecs()) {
      props.setStatus({ kind: "error", message: "End must be after start." })
      return
    }
    setIsRunning(true)
    props.setStatus({ kind: "running" })
    try {
      await trimVideo({
        inputPath: inp,
        outputPath: out,
        startSecs: startSecs(),
        endSecs: endSecs(),
        overwrite: props.overwrite(),
      })
      props.setStatus({ kind: "ok", message: `Trimmed → ${out}` })
    } catch (err: unknown) {
      props.setStatus({ kind: "error", message: formatFfmpegError(err) })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div class="flex flex-col gap-4 p-4">
      <div class="flex gap-6">
        <label class="flex items-center gap-2 text-sm">
          Start (s)
          <input
            type="number"
            min="0"
            step="0.1"
            value={startSecs()}
            onInput={(e) => {
              const v = parseFloat(e.currentTarget.value)
              if (!isNaN(v)) setStartSecs(v)
            }}
            class="w-20"
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          End (s)
          <input
            type="number"
            min="0"
            step="0.1"
            value={endSecs()}
            onInput={(e) => {
              const v = parseFloat(e.currentTarget.value)
              if (!isNaN(v)) setEndSecs(v)
            }}
            class="w-20"
          />
        </label>
      </div>
      <OutputSection
        outputPath={outputPath}
        onPickOutput={() => void handlePickOutput()}
        overwrite={props.overwrite}
        setOverwrite={props.setOverwrite}
        onRun={() => void handleRun()}
        isRunning={isRunning}
        runLabel="Trim"
      />
    </div>
  )
}
