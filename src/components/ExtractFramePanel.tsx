import { createEffect, createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { Status } from "../types"
import { extractFrame, formatFfmpegError, pickOutputFile } from "../lib/ffmpeg"
import { defaultOutputPath } from "../lib/paths"
import OutputSection from "./OutputSection"

interface ExtractFramePanelProps {
  inputPath: Accessor<string | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}

export default function ExtractFramePanel(props: ExtractFramePanelProps) {
  const [outputPath, setOutputPath] = createSignal<string | null>(null)
  const [atSecs, setAtSecs] = createSignal(0)
  const [isRunning, setIsRunning] = createSignal(false)

  createEffect(() => {
    const inp = props.inputPath()
    if (inp !== null) setOutputPath(defaultOutputPath(inp, "extract"))
  })

  async function handlePickOutput() {
    const current = outputPath()
    const defaultName = current ? (current.split("/").at(-1) ?? "frame.jpg") : "frame.jpg"
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
    if (isNaN(atSecs()) || atSecs() < 0) {
      props.setStatus({ kind: "error", message: "Timestamp must be ≥ 0." })
      return
    }
    setIsRunning(true)
    props.setStatus({ kind: "running" })
    try {
      await extractFrame({
        inputPath: inp,
        outputPath: out,
        atSecs: atSecs(),
        overwrite: props.overwrite(),
      })
      props.setStatus({ kind: "ok", message: `Frame extracted → ${out}` })
    } catch (err: unknown) {
      props.setStatus({ kind: "error", message: formatFfmpegError(err) })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div class="flex flex-col gap-4 p-4">
      <label class="flex items-center gap-2 text-sm">
        Timestamp (s)
        <input
          type="number"
          min="0"
          step="0.1"
          value={atSecs()}
          onInput={(e) => {
            const v = parseFloat(e.currentTarget.value)
            if (!isNaN(v)) setAtSecs(v)
          }}
          class="w-20"
        />
      </label>
      <OutputSection
        outputPath={outputPath}
        onPickOutput={() => void handlePickOutput()}
        overwrite={props.overwrite}
        setOverwrite={props.setOverwrite}
        onRun={() => void handleRun()}
        isRunning={isRunning}
        runLabel="Extract Frame"
      />
    </div>
  )
}
