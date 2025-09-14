#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindow};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use std::io::Write;
use std::process::Command; // Import Command from std::process
use base64::{engine::general_purpose, Engine as _};
use uuid::Uuid; // For generating unique filenames
use std::env; // For getting temporary directory
use std::path::PathBuf; // For path manipulation
use std::fs; // For file operations

#[tauri::command]
fn print_current_window(window: WebviewWindow) {
    // Prefer emitting to JS to call window.print() there;
    // this keeps Rust-side minimal. eval works if runtime supports it.
    let _ = window.eval("window.print()");
}

#[tauri::command]
async fn print_billing_document(base64_pdf: String) -> Result<(), String> {
    let decoded_pdf = general_purpose::STANDARD.decode(&base64_pdf)
        .map_err(|e| format!("Failed to decode base64 PDF: {}", e))?;

    let temp_dir = env::temp_dir();
    let file_name = format!("{}.pdf", Uuid::new_v4());
    let temp_path = temp_dir.join(file_name);

    let mut file = fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create temporary PDF file at {}: {}", temp_path.display(), e))?;
    file.write_all(&decoded_pdf)
        .map_err(|e| format!("Failed to write PDF to temporary file: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        let command = format!("start /min \"\" \"{}\" /p", temp_path.display());
        Command::new("cmd")
            .args(&["/C", &command])
            .spawn()
            .map_err(|e| format!("Failed to spawn print command on Windows: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("lp")
            .arg(&temp_path)
            .spawn()
            .map_err(|e| format!("Failed to spawn print command on macOS: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("lp")
            .arg(&temp_path)
            .spawn()
            .map_err(|e| format!("Failed to spawn print command on Linux: {}", e))?;
    }

    // The temporary file will now persist until manually deleted or system cleanup.
    // In a production app, consider a more robust cleanup strategy (e.g., a background task
    // that deletes files older than a certain age, or a mechanism to delete after print job completion).
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Build tray menu with a "print" item
            let print_item = MenuItem::with_id(app, "print", "Print Bill", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&print_item])?;

            // Create tray icon and hook events
            TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "print" {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval("window.print()");
                        }
                    }
                })
                .on_tray_icon_event(|_tray, _event: TrayIconEvent| {
                    // Handle left/double clicks if desired
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![print_current_window, print_billing_document, print_thermal_document])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn print_thermal_document(content: String) -> Result<(), String> {
    // This is a placeholder for actual thermal printer interaction.
    // In a real-world scenario, you would send the `content` directly to a thermal printer
    // using a platform-specific API or a dedicated printer library.
    // For demonstration, we'll just log the content.
    println!("Simulating thermal print job with content: {}", content);
    // You might write to a specific printer port or use a library like `cups` on Linux,
    // or Windows' `RAW` printing, or macOS's `IOKit` for direct printer communication.
    Ok(())
}
