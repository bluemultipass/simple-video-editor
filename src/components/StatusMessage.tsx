import { Show } from "solid-js"
import type { Accessor } from "solid-js"
import type { Status } from "../types"

interface StatusMessageProps {
  status: Accessor<Status>
}

export default function StatusMessage(props: StatusMessageProps) {
  const s = () => props.status()

  const colorClass = () => {
    const kind = s().kind
    if (kind === "error") return "text-red-600"
    if (kind === "ok") return "text-green-600"
    return "text-gray-500"
  }

  const message = () => {
    const st = s()
    if (st.kind === "running") return "Running…"
    if (st.kind === "ok" || st.kind === "error") return st.message
    return ""
  }

  return (
    <Show when={s().kind !== "idle"}>
      <p class={`text-sm whitespace-pre-wrap ${colorClass()}`}>{message()}</p>
    </Show>
  )
}
