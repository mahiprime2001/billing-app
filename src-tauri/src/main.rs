#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
  fs::File,
  io::Write,
  process::Command,
  sync::Mutex,
};
use regex::Regex;
use tauri::{Builder, command, generate_context};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::Builder as UpdaterBuilder;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

static TEMP_FILE_COUNTER: Mutex<u32> = Mutex::new(0);

#[command]
fn print_html(
  printer_name: String,
  html: String,
  _paper_width: u32,
  _paper_height: u32
) -> Result<(), String> {
  // Generate unique temp filename
  let mut counter = TEMP_FILE_COUNTER.lock().unwrap();
  *counter += 1;
  let file_name = format!("tauri_print_{}.txt", counter);

  // Strip HTML tags to get plain-text for thermal printing
  let re = Regex::new(r"<[^>]*>").map_err(|e| e.to_string())?;
  let text = re.replace_all(&html, "").to_string();

  // Write to temp file
  let mut file = File::create(&file_name)
    .map_err(|e| format!("Failed to create file: {}", e))?;
  file.write_all(text.as_bytes())
    .map_err(|e| format!("Failed to write file: {}", e))?;
  drop(file);

  // Send to printer using Windows CMD print command
  let output = Command::new("cmd")
    .args(&["/C", "print", "/D:", &printer_name, &file_name])
    .output()
    .map_err(|e| format!("Failed to run print command: {}", e))?;

  // Delete the temp file after printing
  let _ = std::fs::remove_file(&file_name);

  if output.status.success() {
    Ok(())
  } else {
    Err(format!(
      "Print command error: {}",
      String::from_utf8_lossy(&output.stderr)
    ))
  }
}

#[command]
fn set_thermal_printer_size() -> Result<(), String> {
  // Configure custom paper size using CMD and printui.exe
  let status = Command::new("cmd")
    .args(&[
      "/C",
      "printui.exe",
      "/q",
      "/n",
      "TT0650",
      "/o",
      "PaperSize:Custom.80x12mm",
    ])
    .status()
    .map_err(|e| e.to_string())?;

  if status.success() {
    Ok(())
  } else {
    Err("Failed to set custom paper size via CMD".into())
  }
}

#[tauri::command]
async fn old_print_html(app_handle: tauri::AppHandle, html: String) -> Result<(), String> {
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
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace('\n', "\\n")
        .replace('\r', "\\r");

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

    // User closes the window manually

    Ok(())
}

fn main() {
  Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(UpdaterBuilder::new().build())
    .invoke_handler(tauri::generate_handler![
      print_html,
      set_thermal_printer_size,
      old_print_html
    ])
    .setup(|app| {
      let handle = app.app_handle();

      // Create and spawn sidecar
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

      // Pre-configure custom paper size on startup
      let _ = set_thermal_printer_size();
      Ok(())
    })
    .run(generate_context!())
    .expect("error while running tauri application");
}
