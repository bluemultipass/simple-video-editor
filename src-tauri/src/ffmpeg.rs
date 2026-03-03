use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum FfmpegError {
    #[error("ffmpeg process failed (exit {code}): {stderr}")]
    ProcessFailed { code: i32, stderr: String },

    #[allow(dead_code)]
    #[error("ffmpeg not found on PATH")]
    NotFound,

    #[error("io error: {0}")]
    Io(String),
}

impl From<std::io::Error> for FfmpegError {
    fn from(e: std::io::Error) -> Self {
        FfmpegError::Io(e.to_string())
    }
}

pub async fn run_ffmpeg(app: &tauri::AppHandle, args: Vec<String>) -> Result<(), FfmpegError> {
    let (mut rx, _child) = app
        .shell()
        .command("ffmpeg")
        .args(args)
        .spawn()
        .map_err(|e| FfmpegError::Io(e.to_string()))?;

    let mut stderr_buf = String::new();
    let mut exit_code: i32 = -1;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line) => {
                stderr_buf.push_str(&String::from_utf8_lossy(&line));
                stderr_buf.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code.unwrap_or(-1);
                break;
            }
            _ => {}
        }
    }

    if exit_code != 0 {
        return Err(FfmpegError::ProcessFailed {
            code: exit_code,
            stderr: stderr_buf,
        });
    }
    Ok(())
}

// ── Arg builders ─────────────────────────────────────────────────────────────
// Pure functions, no I/O — unit-testable without a real ffmpeg binary.

/// `-ss`/`-to` placed BEFORE `-i` for fast input-seeking (keyframe-accurate seek).
pub fn trim_args(input: &str, output: &str, start_secs: f64, end_secs: f64) -> Vec<String> {
    vec![
        "-y".into(),
        "-ss".into(),
        format!("{start_secs:.6}"),
        "-to".into(),
        format!("{end_secs:.6}"),
        "-i".into(),
        input.to_owned(),
        "-c".into(),
        "copy".into(),
        output.to_owned(),
    ]
}

pub fn extract_frame_args(input: &str, output: &str, at_secs: f64) -> Vec<String> {
    vec![
        "-y".into(),
        "-ss".into(),
        format!("{at_secs:.6}"),
        "-i".into(),
        input.to_owned(),
        "-vframes".into(),
        "1".into(),
        output.to_owned(),
    ]
}

pub fn remux_args(input: &str, output: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.to_owned(),
        "-c".into(),
        "copy".into(),
        output.to_owned(),
    ]
}

/// Strips all audio tracks. `-an` removes audio; video stream is copied losslessly.
pub fn strip_audio_args(input: &str, output: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.to_owned(),
        "-c:v".into(),
        "copy".into(),
        "-an".into(),
        output.to_owned(),
    ]
}

/// `list_file` must already exist and follow concat-demuxer format.
/// `-safe 0` is required when paths are absolute.
pub fn merge_args(list_file: &str, output: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list_file.to_owned(),
        "-c".into(),
        "copy".into(),
        output.to_owned(),
    ]
}

// ── Unit tests ────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_args_ss_before_i() {
        let args = trim_args("/in.mp4", "/out.mp4", 10.0, 30.5);
        let ss_pos = args.iter().position(|a| a == "-ss").unwrap();
        let i_pos = args.iter().position(|a| a == "-i").unwrap();
        assert!(ss_pos < i_pos, "-ss must precede -i for fast seek");
    }

    #[test]
    fn trim_args_timestamps_formatted() {
        let args = trim_args("/in.mp4", "/out.mp4", 10.5, 30.25);
        let ss_idx = args.iter().position(|a| a == "-ss").unwrap();
        assert_eq!(args[ss_idx + 1], "10.500000");
    }

    #[test]
    fn strip_audio_args_has_an() {
        assert!(strip_audio_args("/in.mp4", "/out.mp4").contains(&"-an".to_string()));
    }

    #[test]
    fn merge_args_has_safe_flag() {
        let args = merge_args("/tmp/list.txt", "/out.mp4");
        let safe_pos = args.iter().position(|a| a == "-safe").unwrap();
        assert_eq!(args[safe_pos + 1], "0");
    }
}
