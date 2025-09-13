#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindow};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

#[tauri::command]
fn print_current_window(window: WebviewWindow) {
    // Prefer emitting to JS to call window.print() there;
    // this keeps Rust-side minimal. eval works if runtime supports it.
    let _ = window.eval("window.print()");
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
        .invoke_handler(tauri::generate_handler![print_current_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
