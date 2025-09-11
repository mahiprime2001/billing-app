#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{generate_context, Manager, WindowEvent};

fn main() {
  tauri::Builder::default()
    // Optional: initialize updater or other plugins here
    // .plugin(tauri_plugin_updater::init())
    .setup(|app| {
      // Get the main window and navigate to localhost:3000
      let window = app.get_window("main").unwrap();
      #[cfg(debug_assertions)]
      {
        // In dev mode, Next.js dev server runs via beforeDevCommand
        window
          .navigate("http://localhost:3000")
          .expect("failed to navigate to dev server");
      }
      #[cfg(not(debug_assertions))]
      {
        // In production, Tauri runner starts Next.js via `npm run start:next`
        window
          .navigate("http://localhost:3000")
          .expect("failed to navigate to production server");
      }
      Ok(())
    })
    .on_window_event(|event| {
      if let WindowEvent::CloseRequested { api, .. } = event.event() {
        api.prevent_close();
        let app_handle = event.window().app_handle();
        let window = event.window().clone();
        tauri::async_runtime::spawn(async move {
          let response = app_handle
            .dialog()
            .message("Are you sure you want to quit?")
            .title("Confirm")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .await;
          if response {
            window.close().unwrap();
          }
        });
      }
    })
    .run(generate_context!())
    .expect("error while running tauri application");
}
