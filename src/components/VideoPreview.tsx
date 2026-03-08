import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import type { Accessor } from "solid-js"

interface VideoPreviewProps {
  url: Accessor<string | null>
  onDuration?: (secs: number) => void
}

export default function VideoPreview(props: VideoPreviewProps) {
  const [blobUrl, setBlobUrl] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | null>(null)

  createEffect(() => {
    const assetUrl = props.url()

    setLoadError(null)

    if (!assetUrl) {
      setBlobUrl(null)
      return
    }

    setLoading(true)

    const controller = new AbortController()
    let objectUrl: string | null = null

    void (async () => {
      try {
        const response = await fetch(assetUrl, { signal: controller.signal })
        if (!response.ok) {
          setLoadError(`Failed to load video (HTTP ${response.status.toString()})`)
          return
        }
        const blob = await response.blob()
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setBlobUrl(objectUrl)
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return
        setLoadError(e instanceof Error ? e.message : "Failed to load video")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    onCleanup(() => {
      controller.abort()
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
      setBlobUrl(null)
      setLoading(false)
    })
  })

  return (
    <Show when={props.url()}>
      <Show when={loading()}>
        <div class="flex h-24 items-center justify-center rounded bg-black text-sm text-gray-400">
          Loading preview…
        </div>
      </Show>
      <Show when={loadError()}>
        <div class="rounded bg-red-50 p-3 text-sm text-red-600">{loadError()}</div>
      </Show>
      <Show when={blobUrl()}>
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
    </Show>
  )
}
