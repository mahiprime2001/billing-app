// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayEvent, Window};

#[tauri::command]
fn print_current_window(window: Window) {
    window.eval("window.print()").unwrap();
}

fn main() {
    let print = CustomMenuItem::new("print".to_string(), "Print Bill");
    let tray_menu = SystemTrayMenu::new().add_item(print);

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => {
                if id.as_str() == "print" {
                    let window = app.get_window("main").unwrap();
                    window.eval("window.print()").unwrap();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![print_current_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
