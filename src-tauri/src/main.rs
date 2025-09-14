#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, thread, time::Duration, process::Command};
use uuid::Uuid;
use base64::{engine::general_purpose, Engine as _};
use tauri::{Builder, AppHandle, generate_context};
use tauri::webview::WebviewWindowBuilder;
use tauri::utils::config::WebviewUrl;  // <– Use the new WebviewUrl
use url::Url;                         // <– Import Url to build file:// URLs

#[tauri::command]
async fn open_print_window(app_handle: AppHandle, html: String) -> Result<(), String> {
  // 1. Write HTML to a temporary file
  let temp_path = env::temp_dir().join(format!("print_{}.html", Uuid::new_v4()));
  fs::write(&temp_path, &html)
    .map_err(|e| format!("Failed to write HTML: {}", e))?;

  // 2. Build and show a new webview window loading the file:// URL
  let label = format!("print_win_{}", Uuid::new_v4());
  // Convert the file path to a file:// URL
  let file_url = Url::from_file_path(&temp_path)
    .map_err(|_| format!("Failed to convert file path to URL"))?;
  // Use WebviewUrl::External for the file URL
  let url = WebviewUrl::External(file_url);
  let new_window = WebviewWindowBuilder::new(&app_handle, &label, url)
    .title("Print Preview")
    .inner_size(800.0, 600.0)
    .resizable(true)
    .focused(true)
    .build()
    .map_err(|e| format!("Window build error: {}", e))?;

  // 3. Trigger native print dialog after a short delay
  thread::sleep(Duration::from_millis(200));
  new_window
    .eval("window.print()")
    .map_err(|e| format!("Print eval error: {}", e))?;

  Ok(())
}

#[tauri::command]
async fn print_billing_document(base64_pdf: String) -> Result<(), String> {
  // Decode Base64 PDF and write to temp file
  let decoded = general_purpose::STANDARD.decode(&base64_pdf)
    .map_err(|e| format!("PDF decode error: {}", e))?;
  let temp_path = env::temp_dir().join(format!("{}.pdf", Uuid::new_v4()));
  fs::write(&temp_path, &decoded)
    .map_err(|e| format!("Failed to write PDF: {}", e))?;

  // Platform-specific print invocation
  #[cfg(target_os = "windows")]
  {
    let cmd = format!("start /min \"\" \"{}\" /p", temp_path.display());
    Command::new("cmd")
      .args(&["/C", &cmd])
      .spawn()
      .map_err(|e| format!("Windows print error: {}", e))?;
  }
  #[cfg(target_os = "macos")]
  {
    Command::new("lp")
      .arg(&temp_path)
      .spawn()
      .map_err(|e| format!("macOS print error: {}", e))?;
  }
  #[cfg(target_os = "linux")]
  {
    Command::new("lp")
      .arg(&temp_path)
      .spawn()
      .map_err(|e| format!("Linux print error: {}", e))?;
  }

  Ok(())
}

#[tauri::command]
async fn print_thermal_document(content: String) -> Result<(), String> {
  // Placeholder for thermal printer logic
  println!("Thermal print content: {}", content);
  Ok(())
}

fn main() {
  Builder::default()
    .invoke_handler(tauri::generate_handler![
      open_print_window,
      print_billing_document,
      print_thermal_document
    ])
    .run(generate_context!())
    .expect("error while running tauri application");
}
