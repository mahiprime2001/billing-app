#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.app_handle();

            // Create the sidecar command for the "billing-backend" binary
            let command = handle.shell().sidecar("Siriadmin-backend")?;

            // Spawn the sidecar process - returns (Receiver<CommandEvent>, CommandChild)
            let (mut rx, mut _child) = command.spawn().expect("Failed to spawn sidecar");

            tauri::async_runtime::spawn(async move {
                // Listen to events from the receiver
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("Sidecar stdout: {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("Sidecar stderr: {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
