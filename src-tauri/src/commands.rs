use tauri_plugin_dialog::DialogExt;

use crate::ffmpeg::{self, FfmpegError};

#[tauri::command]
pub async fn trim_video(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    start_secs: f64,
    end_secs: f64,
) -> Result<(), FfmpegError> {
    println!("[trim_video] called: input={input_path} output={output_path} start={start_secs} end={end_secs}");
    ffmpeg::run_ffmpeg(
        &app,
        ffmpeg::trim_args(&input_path, &output_path, start_secs, end_secs),
    )
    .await
}

#[tauri::command]
pub async fn extract_frame(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    at_secs: f64,
) -> Result<(), FfmpegError> {
    ffmpeg::run_ffmpeg(
        &app,
        ffmpeg::extract_frame_args(&input_path, &output_path, at_secs),
    )
    .await
}

#[tauri::command]
pub async fn remux(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
) -> Result<(), FfmpegError> {
    ffmpeg::run_ffmpeg(&app, ffmpeg::remux_args(&input_path, &output_path)).await
}

#[tauri::command]
pub async fn strip_audio(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
) -> Result<(), FfmpegError> {
    ffmpeg::run_ffmpeg(&app, ffmpeg::strip_audio_args(&input_path, &output_path)).await
}

#[tauri::command]
pub async fn merge_clips(
    app: tauri::AppHandle,
    input_paths: Vec<String>,
    output_path: String,
) -> Result<(), FfmpegError> {
    let list_path = std::env::temp_dir().join("sve_ffmpeg_concat.txt");
    let list_content: String = input_paths
        .iter()
        .map(|p| format!("file '{}'\n", p.replace('\'', "'\\''")))
        .collect();
    std::fs::write(&list_path, list_content).map_err(|e| FfmpegError::Io(e.to_string()))?;
    let list_str = list_path.to_string_lossy().into_owned();
    let result = ffmpeg::run_ffmpeg(&app, ffmpeg::merge_args(&list_str, &output_path)).await;
    let _ = std::fs::remove_file(&list_path); // clean up regardless of success
    result
}

#[tauri::command]
pub async fn pick_input_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter(
            "Video files",
            &["mp4", "mkv", "mov", "avi", "webm", "m4v", "ts", "mts"],
        )
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_output_file(
    app: tauri::AppHandle,
    default_name: String,
) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(path.map(|p| p.to_string()))
}
