mod commands;
mod ffmpeg;
mod file_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(std::sync::Mutex::new(None::<file_server::FileServer>))
        .invoke_handler(tauri::generate_handler![
            commands::trim_video,
            commands::extract_frame,
            commands::remux,
            commands::strip_audio,
            commands::merge_clips,
            commands::pick_input_file,
            commands::pick_input_files,
            commands::pick_output_file,
            commands::start_file_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
