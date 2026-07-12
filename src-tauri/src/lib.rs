#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Select the TLS crypto engine before anything opens an HTTPS connection.
  let _ = rustls::crypto::ring::default_provider().install_default();

  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
