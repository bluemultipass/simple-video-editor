mod commands;
mod ffmpeg;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::trim_video,
            commands::extract_frame,
            commands::remux,
            commands::strip_audio,
            commands::merge_clips,
            commands::pick_input_file,
            commands::pick_input_files,
            commands::pick_output_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
