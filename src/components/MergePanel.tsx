import { createEffect, createSignal, For } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { Status } from "../types"
import { formatFfmpegError, mergeClips, pickInputFiles, pickOutputFile } from "../lib/ffmpeg"
import { defaultMergeOutputPath } from "../lib/paths"
import OutputSection from "./OutputSection"

interface MergePanelProps {
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  setStatus: (s: Status) => void
  onPreviewChange: (path: string | null) => void
}

export default function MergePanel(props: MergePanelProps) {
  const [mergeInputs, setMergeInputs] = createSignal<string[]>([])
  const [outputPath, setOutputPath] = createSignal<string | null>(null)
  const [isRunning, setIsRunning] = createSignal(false)

  createEffect(() => {
    const inputs = mergeInputs()
    const first = inputs[0] ?? null
    props.onPreviewChange(first)
    setOutputPath(defaultMergeOutputPath(first))
  })

  async function handleAddFiles() {
    const files = await pickInputFiles()
    if (files.length > 0) setMergeInputs((prev) => [...prev, ...files])
  }

  function handleRemove(index: number) {
    setMergeInputs((prev) => prev.filter((_, i) => i !== index))
  }

  async function handlePickOutput() {
    const current = outputPath()
    const defaultName = current
      ? (current.split("/").at(-1) ?? "merged_output.mp4")
      : "merged_output.mp4"
    const path = await pickOutputFile(defaultName)
    if (path !== null) setOutputPath(path)
  }

  async function handleRun() {
    const inputs = mergeInputs()
    const out = outputPath()
    if (inputs.length < 2) {
      props.setStatus({ kind: "error", message: "Add at least 2 files to merge." })
      return
    }
    if (!out) {
      props.setStatus({ kind: "error", message: "Set an output path first." })
      return
    }
    setIsRunning(true)
    props.setStatus({ kind: "running" })
    try {
      await mergeClips({ inputPaths: inputs, outputPath: out, overwrite: props.overwrite() })
      props.onPreviewChange(out)
      props.setStatus({ kind: "ok", message: `Merged → ${out}` })
    } catch (err: unknown) {
      props.setStatus({ kind: "error", message: formatFfmpegError(err) })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Files to merge</span>
          <button type="button" onClick={() => void handleAddFiles()}>
            Add Files
          </button>
        </div>
        <For
          each={mergeInputs()}
          fallback={<p class="text-sm text-gray-500">No files added yet.</p>}
        >
          {(file, index) => (
            <div class="flex items-center gap-2">
              <span class="flex-1 overflow-hidden text-sm text-ellipsis whitespace-nowrap">
                {file}
              </span>
              <button
                type="button"
                onClick={() => {
                  handleRemove(index())
                }}
                class="shrink-0 text-sm text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          )}
        </For>
      </div>
      <OutputSection
        outputPath={outputPath}
        onPickOutput={() => void handlePickOutput()}
        overwrite={props.overwrite}
        setOverwrite={props.setOverwrite}
        onRun={() => void handleRun()}
        isRunning={isRunning}
        runLabel="Merge"
      />
    </div>
  )
}
