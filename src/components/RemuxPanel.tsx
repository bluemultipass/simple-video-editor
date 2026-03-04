import { createEffect, createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { RemuxFormat, Status } from "../types"
import { formatFfmpegError, pickOutputFile, remux } from "../lib/ffmpeg"
import { defaultOutputPath } from "../lib/paths"
import OutputSection from "./OutputSection"

interface RemuxPanelProps {
  inputPath: Accessor<string | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}

export default function RemuxPanel(props: RemuxPanelProps) {
  const [outputPath, setOutputPath] = createSignal<string | null>(null)
  const [format, setFormat] = createSignal<RemuxFormat>("mp4")
  const [isRunning, setIsRunning] = createSignal(false)

  // Recompute output path whenever input or format changes
  createEffect(() => {
    const inp = props.inputPath()
    if (inp !== null) setOutputPath(defaultOutputPath(inp, "remux", format()))
  })

  async function handlePickOutput() {
    const current = outputPath()
    const defaultName = current
      ? (current.split("/").at(-1) ?? `output.${format()}`)
      : `output.${format()}`
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
    setIsRunning(true)
    props.setStatus({ kind: "running" })
    try {
      await remux({ inputPath: inp, outputPath: out, overwrite: props.overwrite() })
      props.setStatus({ kind: "ok", message: `Remuxed → ${out}` })
    } catch (err: unknown) {
      props.setStatus({ kind: "error", message: formatFfmpegError(err) })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div class="flex flex-col gap-4 p-4">
      <label class="flex items-center gap-2 text-sm">
        Target format
        <select
          value={format()}
          onChange={(e) => setFormat(e.currentTarget.value as RemuxFormat)}
          class="rounded border border-gray-300 px-2 py-1"
        >
          <option value="mp4">MP4</option>
          <option value="mkv">MKV</option>
          <option value="webm">WebM</option>
        </select>
      </label>
      <OutputSection
        outputPath={outputPath}
        onPickOutput={() => void handlePickOutput()}
        overwrite={props.overwrite}
        setOverwrite={props.setOverwrite}
        onRun={() => void handleRun()}
        isRunning={isRunning}
        runLabel="Remux"
      />
    </div>
  )
}
