#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt; // Import ShellExt for handle.shell() method
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "windows")]
use windows::core::PCWSTR;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::ShellExecuteW;

#[cfg(target_os = "windows")]
use std::ffi::OsString;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;

#[tauri::command]
async fn print_to_thermal_printer(_app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    // Placeholder for thermal printing logic
    println!("Received data for thermal printer: {}", data);
    // Implement actual printer communication here.
    Ok(())
}

#[tauri::command]
async fn print_html(app_handle: tauri::AppHandle, html: String) -> Result<(), String> {
    let print_window_label = format!("print-{}", uuid::Uuid::new_v4());

    // Create a larger resizable window for print preview
    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        &print_window_label,
        WebviewUrl::App("about:blank".into()),
    )
    .title("Print Preview")
    .inner_size(800.0, 600.0)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .visible(true)
    .center()
    .always_on_top(false)
    .skip_taskbar(true)
    .decorations(true)
    .build()
    .map_err(|e| format!("Failed to create webview window: {}", e))?;

    // Escape HTML for JS eval
    let escaped_html = html
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace('\n', "\\n")
        .replace('\r', "\\r");

    let set_html_script = format!(
        r#"document.open(); document.write(`{}`); document.close();"#,
        escaped_html
    );

    webview_window
        .eval(&set_html_script)
        .map_err(|e| format!("Failed to set HTML content: {}", e))?;

    // Wait for content to load before printing
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

    #[cfg(target_os = "windows")]
    {
        // Save HTML to a temporary file
        let temp_dir = std::env::temp_dir();
        let temp_file_path = temp_dir.join(format!("{}.html", uuid::Uuid::new_v4()));
        tokio::fs::write(&temp_file_path, html.as_bytes())
            .await
            .map_err(|e| format!("Failed to write temporary HTML file: {}", e))?;

        let file_path_wide: Vec<u16> = OsString::from(&temp_file_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let operation_wide: Vec<u16> = OsString::from("print")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let result = ShellExecuteW(
                Some(HWND(std::ptr::null_mut())), // Fixed: wrapped in Some, null pointer
                PCWSTR(operation_wide.as_ptr()),
                PCWSTR(file_path_wide.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOW,
            );

            if (result.0 as isize) <= 32 {
                return Err(format!(
                    "Failed to invoke print dialog via ShellExecuteW. Error code: {:?}",
                    result.0 // Debug formatting for raw pointer
                ));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        webview_window
            .print()
            .map_err(|e| format!("Failed to print: {}", e))?;
    }

    // Keep window open for user to manually close it
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![print_html, print_to_thermal_printer])
        .setup(|app| {
            let handle = app.app_handle();
            // Create sidecar command for backend
            let command = handle.shell().sidecar("Siriadmin-backend")?;
            let (mut rx, _child) = command.spawn().expect("Failed to spawn sidecar");
            tauri::async_runtime::spawn(async move {
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
