import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import type { Accessor } from "solid-js"
import { invoke } from "@tauri-apps/api/core"

interface VideoPreviewProps {
  filePath: Accessor<string | null>
  onDuration?: (secs: number) => void
}

export default function VideoPreview(props: VideoPreviewProps) {
  const [videoUrl, setVideoUrl] = createSignal<string | null>(null)

  createEffect(() => {
    const path = props.filePath()
    setVideoUrl(null)
    if (!path) return

    let stale = false
    void invoke<string>("start_file_server", { path })
      .then((url) => {
        if (!stale) setVideoUrl(url)
      })
      .catch(() => {
        if (!stale) setVideoUrl(null)
      })
    onCleanup(() => {
      stale = true
    })
  })

  return (
    <Show when={videoUrl()}>
      {(url) => (
        <video
          class="w-full rounded bg-black"
          src={url()}
          controls
          onLoadedMetadata={(e) => {
            props.onDuration?.(e.currentTarget.duration)
          }}
        />
      )}
    </Show>
  )
}
