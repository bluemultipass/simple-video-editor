import type { Accessor } from "solid-js"

interface InputFilePickerProps {
  path: Accessor<string | null>
  onPick: () => void
}

export default function InputFilePicker(props: InputFilePickerProps) {
  return (
    <div class="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          props.onPick()
        }}
      >
        Open File
      </button>
      <span class="flex-1 overflow-hidden text-sm text-ellipsis whitespace-nowrap">
        {props.path() ?? "No file selected"}
      </span>
    </div>
  )
}
