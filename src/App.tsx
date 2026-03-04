import { createMemo, createSignal, Show } from "solid-js"
import { convertFileSrc } from "@tauri-apps/api/core"
import { Tabs } from "@kobalte/core/tabs"
import type { Operation, Status } from "./types"
import { pickInputFile } from "./lib/ffmpeg"
import VideoPreview from "./components/VideoPreview"
import InputFilePicker from "./components/InputFilePicker"
import StatusMessage from "./components/StatusMessage"
import TrimPanel from "./components/TrimPanel"
import ExtractFramePanel from "./components/ExtractFramePanel"
import RemuxPanel from "./components/RemuxPanel"
import StripAudioPanel from "./components/StripAudioPanel"
import MergePanel from "./components/MergePanel"
import "./App.css"

const triggerClass =
  "px-4 py-2 text-sm text-gray-600 hover:text-gray-900 data-[selected]:border-b-2 data-[selected]:border-blue-600 data-[selected]:font-semibold data-[selected]:text-blue-700"

function App() {
  const [inputPath, setInputPath] = createSignal<string | null>(null)
  const [previewPath, setPreviewPath] = createSignal<string | null>(null)
  const [overwrite, setOverwrite] = createSignal(false)
  const [status, setStatus] = createSignal<Status>({ kind: "idle" })
  const [activeTab, setActiveTab] = createSignal<Operation>("trim")
  const [videoDuration, setVideoDuration] = createSignal<number | null>(null)

  const previewUrl = createMemo(() => {
    const p = previewPath()
    return p !== null ? convertFileSrc(p) : null
  })

  function handleTabChange(tab: string) {
    setActiveTab(tab as Operation)
    setStatus({ kind: "idle" })
    if (tab !== "merge") setPreviewPath(inputPath())
  }

  async function handlePickInput() {
    const path = await pickInputFile()
    if (path !== null) {
      setInputPath(path)
      setPreviewPath(path)
      setVideoDuration(null)
    }
  }

  return (
    <main class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 class="text-center text-2xl font-bold">Simple Video Editor</h1>
      <VideoPreview url={previewUrl} onDuration={setVideoDuration} />
      <Show when={activeTab() !== "merge"}>
        <InputFilePicker path={inputPath} onPick={() => void handlePickInput()} />
      </Show>
      <Tabs value={activeTab()} onChange={handleTabChange}>
        <Tabs.List class="flex border-b border-gray-200">
          <Tabs.Trigger value="trim" class={triggerClass}>
            Trim
          </Tabs.Trigger>
          <Tabs.Trigger value="extract" class={triggerClass}>
            Extract Frame
          </Tabs.Trigger>
          <Tabs.Trigger value="remux" class={triggerClass}>
            Remux
          </Tabs.Trigger>
          <Tabs.Trigger value="strip-audio" class={triggerClass}>
            Strip Audio
          </Tabs.Trigger>
          <Tabs.Trigger value="merge" class={triggerClass}>
            Merge
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="trim">
          <TrimPanel
            inputPath={inputPath}
            videoDuration={videoDuration}
            overwrite={overwrite}
            setOverwrite={setOverwrite}
            setStatus={setStatus}
          />
        </Tabs.Content>
        <Tabs.Content value="extract">
          <ExtractFramePanel
            inputPath={inputPath}
            overwrite={overwrite}
            setOverwrite={setOverwrite}
            setStatus={setStatus}
          />
        </Tabs.Content>
        <Tabs.Content value="remux">
          <RemuxPanel
            inputPath={inputPath}
            overwrite={overwrite}
            setOverwrite={setOverwrite}
            setStatus={setStatus}
          />
        </Tabs.Content>
        <Tabs.Content value="strip-audio">
          <StripAudioPanel
            inputPath={inputPath}
            overwrite={overwrite}
            setOverwrite={setOverwrite}
            setStatus={setStatus}
          />
        </Tabs.Content>
        <Tabs.Content value="merge">
          <MergePanel
            overwrite={overwrite}
            setOverwrite={setOverwrite}
            setStatus={setStatus}
            onPreviewChange={setPreviewPath}
          />
        </Tabs.Content>
      </Tabs>
      <StatusMessage status={status} />
    </main>
  )
}

export default App
