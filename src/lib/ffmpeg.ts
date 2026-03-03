import { invoke } from "@tauri-apps/api/core"

export interface TrimOptions {
  inputPath: string
  outputPath: string
  startSecs: number
  endSecs: number
}

export interface ExtractFrameOptions {
  inputPath: string
  outputPath: string
  atSecs: number
}

export interface RemuxOptions {
  inputPath: string
  outputPath: string
}

export interface StripAudioOptions {
  inputPath: string
  outputPath: string
}

export interface MergeOptions {
  inputPaths: string[]
  outputPath: string
}

// Mirrors the FfmpegError Rust enum (serde serialises as tagged variants)
export type FfmpegError =
  | { ProcessFailed: { code: number; stderr: string } }
  | { NotFound: null }
  | { Io: string }

export async function trimVideo(opts: TrimOptions): Promise<void> {
  return invoke("trim_video", {
    inputPath: opts.inputPath,
    outputPath: opts.outputPath,
    startSecs: opts.startSecs,
    endSecs: opts.endSecs,
  })
}

export async function extractFrame(opts: ExtractFrameOptions): Promise<void> {
  return invoke("extract_frame", {
    inputPath: opts.inputPath,
    outputPath: opts.outputPath,
    atSecs: opts.atSecs,
  })
}

export async function remux(opts: RemuxOptions): Promise<void> {
  return invoke("remux", {
    inputPath: opts.inputPath,
    outputPath: opts.outputPath,
  })
}

export async function stripAudio(opts: StripAudioOptions): Promise<void> {
  return invoke("strip_audio", {
    inputPath: opts.inputPath,
    outputPath: opts.outputPath,
  })
}

export async function mergeClips(opts: MergeOptions): Promise<void> {
  return invoke("merge_clips", {
    inputPaths: opts.inputPaths,
    outputPath: opts.outputPath,
  })
}

export async function pickInputFile(): Promise<string | null> {
  return invoke<string | null>("pick_input_file")
}

export async function pickOutputFile(defaultName: string): Promise<string | null> {
  return invoke<string | null>("pick_output_file", { defaultName })
}
