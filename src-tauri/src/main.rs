#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::Builder as UpdaterBuilder;
#[tauri::command]
async fn print_html(app_handle: tauri::AppHandle, html: String) -> Result<(), String> {
    let print_window_label = format!("print-{}", uuid::Uuid::new_v4());
    // Create a larger resizable window for print preview
    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        &print_window_label,
        WebviewUrl::App("about:blank".into())
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
    // Escape HTML content for JS eval safely
    let escaped_html = html
        .replace('\\', "\\\\") // Escape backslashes
        .replace('`', "\\`")   // Escape backticks
        .replace('\n', "\\n")  // Escape newlines
        .replace('\r', "\\r"); // Escape carriage returns
    let set_html_script = format!(
        r#"document.open(); document.write(`{}`); document.close();"#,
        escaped_html
    );
    webview_window.eval(&set_html_script)
        .map_err(|e| format!("Failed to set HTML content: {}", e))?;
    // Wait for the content to load before printing
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    // Trigger print dialog
    webview_window.print()
        .map_err(|e| format!("Failed to print: {}", e))?;
    // Do NOT close the print window automatically; user will close manually
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![print_html])
        .setup(|app| {
            let handle = app.app_handle();
            // Create the sidecar command for the backend
            let command = handle.shell().sidecar("Siriadmin-backend")?;
            // Spawn the sidecar process
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
