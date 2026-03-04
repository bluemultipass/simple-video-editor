import type { Operation, RemuxFormat } from "../types"

export function defaultOutputPath(
  input: string,
  operation: Exclude<Operation, "merge">,
  remuxFormat?: RemuxFormat,
): string {
  const base = input.replace(/\.[^/.]+$/, "")
  const ext = input.match(/\.[^/.]+$/)?.[0] ?? ".mp4"
  switch (operation) {
    case "trim":
      return `${base}_trimmed${ext}`
    case "extract":
      return `${base}_frame.jpg`
    case "remux":
      return `${base}.${remuxFormat ?? "mp4"}`
    case "strip-audio":
      return `${base}_noaudio${ext}`
  }
}

export function defaultMergeOutputPath(firstInput: string | null): string {
  if (!firstInput) return "merged_output.mp4"
  const lastSlash = firstInput.lastIndexOf("/")
  const dir = lastSlash >= 0 ? firstInput.slice(0, lastSlash) : "."
  return `${dir}/merged_output.mp4`
}
