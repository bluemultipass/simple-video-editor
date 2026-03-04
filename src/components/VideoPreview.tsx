import { Show } from "solid-js"
import type { Accessor } from "solid-js"

interface VideoPreviewProps {
  url: Accessor<string | null>
  onDuration?: (secs: number) => void
}

export default function VideoPreview(props: VideoPreviewProps) {
  return (
    <Show when={props.url()}>
      {(url) => (
        <video
          class="w-full rounded bg-black"
          src={url()}
          controls
          preload="metadata"
          onLoadedMetadata={(e) => {
            props.onDuration?.(e.currentTarget.duration)
          }}
        />
      )}
    </Show>
  )
}
