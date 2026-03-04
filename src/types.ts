export type Operation = "trim" | "extract" | "remux" | "strip-audio" | "merge"

export type RemuxFormat = "mp4" | "mkv" | "webm"

export type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string }
