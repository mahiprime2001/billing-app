#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri::Manager;

// Define a simple print command using window.print() approach
#[tauri::command]
async fn print_html_document(html_content: String) -> Result<(), String> {
    // Since we're using window.print(), we don't need complex printing logic here
    // This command could be used to prepare data or trigger frontend printing
    println!("Print request for HTML content: {}", html_content);
    Ok(())
}

// Alternative: Direct browser print command
#[tauri::command]
async fn trigger_print() -> Result<(), String> {
    // This will be called from frontend to trigger window.print()
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Remove the printer plugin to avoid version conflicts
        .invoke_handler(tauri::generate_handler![print_html_document, trigger_print])
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
