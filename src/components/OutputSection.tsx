import type { Accessor, Setter } from "solid-js"

interface OutputSectionProps {
  outputPath: Accessor<string | null>
  onPickOutput: () => void
  overwrite: Accessor<boolean>
  setOverwrite: Setter<boolean>
  onRun: () => void
  isRunning: Accessor<boolean>
  runLabel: string
}

export default function OutputSection(props: OutputSectionProps) {
  return (
    <div class="flex flex-col gap-3 border-t border-gray-200 pt-4">
      <div class="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            props.onPickOutput()
          }}
        >
          Save As
        </button>
        <span class="flex-1 overflow-hidden text-sm text-ellipsis whitespace-nowrap">
          {props.outputPath() ?? "No output path set"}
        </span>
      </div>
      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={props.overwrite()}
          onChange={(e) => props.setOverwrite(e.currentTarget.checked)}
        />
        Allow overwrite existing file
      </label>
      <button
        type="button"
        disabled={props.isRunning()}
        onClick={() => {
          props.onRun()
        }}
      >
        {props.isRunning() ? `${props.runLabel}…` : props.runLabel}
      </button>
    </div>
  )
}
