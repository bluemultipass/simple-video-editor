import { createEffect, createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { Status } from "../types"
import { formatFfmpegError, pickOutputFile, stripAudio } from "../lib/ffmpeg"
import { defaultOutputPath } from "../lib/paths"
import OutputSection from "./OutputSection"

interface StripAudioPanelProps {
  inputPath: Accessor<string | null>
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
}

export default function StripAudioPanel(props: StripAudioPanelProps) {
  const [outputPath, setOutputPath] = createSignal<string | null>(null)
  const [isRunning, setIsRunning] = createSignal(false)

  createEffect(() => {
    const inp = props.inputPath()
    if (inp !== null) setOutputPath(defaultOutputPath(inp, "strip-audio"))
  })

  async function handlePickOutput() {
    const current = outputPath()
    const defaultName = current
      ? (current.split("/").at(-1) ?? "output_noaudio.mp4")
      : "output_noaudio.mp4"
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
      await stripAudio({ inputPath: inp, outputPath: out, overwrite: props.overwrite() })
      props.setStatus({ kind: "ok", message: `Audio stripped → ${out}` })
    } catch (err: unknown) {
      props.setStatus({ kind: "error", message: formatFfmpegError(err) })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div class="flex flex-col gap-4 p-4">
      <p class="text-sm text-gray-600">Removes the audio track from the video.</p>
      <OutputSection
        outputPath={outputPath}
        onPickOutput={() => void handlePickOutput()}
        overwrite={props.overwrite}
        setOverwrite={props.setOverwrite}
        onRun={() => void handleRun()}
        isRunning={isRunning}
        runLabel="Strip Audio"
      />
    </div>
  )
}
