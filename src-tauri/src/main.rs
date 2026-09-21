#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use tauri::{WebviewUrl, WebviewWindowBuilder, AppHandle, Manager};
use warp::Filter;
use serde::{Deserialize, Serialize};
use log::{info, error, debug};
use std::path::PathBuf;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_log::{Target, TargetKind};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

// ============================================================================
// UPDATER COMMANDS
// ============================================================================

#[tauri::command]
async fn check_for_updates(app_handle: AppHandle) -> Result<String, String> {
    info!("[check_for_updates] Checking for updates...");
    match app_handle.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                info!("[check_for_updates] Update available: {}", update.version);
                Ok(format!("Update available: {}", update.version))
            }
            Ok(None) => {
                info!("[check_for_updates] No update available");
                Ok("No update available.".to_string())
            }
            Err(e) => {
                error!("[check_for_updates] Failed: {}", e);
                Err(format!("Failed to check for updates: {}", e))
            }
        },
        Err(e) => {
            error!("[check_for_updates] Updater init failed: {}", e);
            Err(format!("Failed to get updater: {}", e))
        }
    }
}

#[tauri::command]
async fn install_update(app_handle: AppHandle) -> Result<String, String> {
    info!("[install_update] Starting update flow...");

    match app_handle.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                info!("[install_update] Downloading v{}...", update.version);
                match update
                    .download_and_install(
                        |chunk, total| {
                            debug!("[install_update] Progress: {} / {:?}", chunk, total);
                        },
                        || info!("[install_update] Download complete, applying..."),
                    )
                    .await
                {
                    Ok(_) => {
                        info!("[install_update] Installed. Restarting...");
                        app_handle.restart();
                    }
                    Err(e) => {
                        error!("[install_update] Failed: {}", e);
                        return Err(format!("Failed to download/install update: {}", e));
                    }
                }
            }
            Ok(None) => {
                return Ok("No update available.".into());
            }
            Err(e) => {
                return Err(format!("Update check failed: {}", e));
            }
        },
        Err(e) => {
            return Err(format!("Updater error: {}", e));
        }
    }

    Ok("Update complete.".into())
}

// ============================================================================
// PRINTER STRUCTS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintRequest {
    #[serde(rename = "productIds")]
    product_ids: Vec<String>,
    copies: i32,
    #[serde(rename = "printerName")]
    printer_name: String,
    #[serde(rename = "storeName")]
    store_name: Option<String>,
    #[serde(rename = "tsplCommands")]
    tspl_commands: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PrintResponse {
    status: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PrintersResponse {
    status: String,
    printers: Vec<String>,
}

type PrinterList = Arc<Mutex<Vec<String>>>;

// ============================================================================
// PRINTER COMMANDS
// ============================================================================

#[tauri::command]
async fn print_to_thermal_printer(
    printer_name: String,
    tspl_commands: String,
    copies: Option<i32>,
) -> Result<PrintResponse, PrintResponse> {
    let copies = copies.unwrap_or(1);
    info!("[print_to_thermal_printer] printer='{}' copies={}", printer_name, copies);

    let mut final_response = PrintResponse {
        status: "success".into(),
        message: "Print job completed successfully.".into(),
    };

    for copy_num in 1..=copies {
        info!("[print_to_thermal_printer] Sending copy {}/{}", copy_num, copies);
        let result = send_tspl_to_printer(printer_name.clone(), tspl_commands.clone()).await;
        if let Err(err) = result {
            error!("[print_to_thermal_printer] Failed at copy {}: {:?}", copy_num, err);
            final_response = err;
            break;
        }
    }

    Ok(final_response)
}

#[tauri::command]
async fn get_available_printers() -> Result<Vec<String>, String> {
    info!("[get_available_printers] Scanning for printers...");

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        debug!("[get_available_printers] Running: wmic printer get name (no window)");
        let output = Command::new("wmic")
            .args(["printer", "get", "name"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to get printers: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let printers: Vec<String> = stdout
            .lines()
            .skip(1)
            .filter(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .collect();
        info!("[get_available_printers] Found {} printers: {:?}", printers.len(), printers);
        Ok(printers)
    }

    #[cfg(not(target_os = "windows"))]
    {
        info!("[get_available_printers] Non-Windows, returning default");
        Ok(vec!["Default Printer".into()])
    }
}

#[tauri::command]
async fn send_tspl_to_printer(
    printer_name: String,
    tspl_commands: String,
) -> Result<PrintResponse, PrintResponse> {
    info!("[send_tspl_to_printer] Sending to printer: '{}'", printer_name);
    debug!("[send_tspl_to_printer] TSPL payload: {}", tspl_commands);

    #[cfg(target_os = "windows")]
    {
        use std::ffi::CString;
        use std::ptr;
        use windows::Win32::Graphics::Printing::{
            ClosePrinter, DOC_INFO_1A, EndDocPrinter, EndPagePrinter, OpenPrinterA,
            StartDocPrinterA, StartPagePrinter, WritePrinter, PRINTER_DEFAULTSA,
            PRINTER_HANDLE, PRINTER_ACCESS_ADMINISTER, PRINTER_ACCESS_USE,
        };
        use windows::core::{PCSTR, PSTR};

        unsafe {
            let name_cstr = CString::new(printer_name.clone()).map_err(|e| PrintResponse {
                status: "error".into(),
                message: format!("Invalid printer name: {}", e),
            })?;

            let mut handle: PRINTER_HANDLE = PRINTER_HANDLE::default();
            let defaults = PRINTER_DEFAULTSA {
                pDatatype: PSTR(std::ptr::null_mut()),
                pDevMode: ptr::null_mut(),
                DesiredAccess: PRINTER_ACCESS_USE | PRINTER_ACCESS_ADMINISTER,
            };

            debug!("[send_tspl_to_printer] Calling OpenPrinterA...");
            if OpenPrinterA(PCSTR(name_cstr.as_ptr() as _), &mut handle, Some(&defaults)).is_err() {
                error!("[send_tspl_to_printer] OpenPrinterA failed for '{}'", printer_name);
                return Err(PrintResponse {
                    status: "error".into(),
                    message: "OpenPrinterA failed.".into(),
                });
            }

            let title = CString::new("TSPL Job").unwrap();
            let mut doc_info = DOC_INFO_1A {
                pDocName: PSTR(title.as_ptr() as *mut _),
                pOutputFile: PSTR(std::ptr::null_mut()),
                pDatatype: PSTR(b"RAW\0".as_ptr() as *mut _),
            };

            debug!("[send_tspl_to_printer] Calling StartDocPrinterA...");
            let job_id = StartDocPrinterA(handle, 1, &mut doc_info);
            if job_id == 0 {
                error!("[send_tspl_to_printer] StartDocPrinterA failed");
                ClosePrinter(handle).ok();
                return Err(PrintResponse {
                    status: "error".into(),
                    message: "StartDocPrinterA failed.".into(),
                });
            }

            debug!("[send_tspl_to_printer] Calling StartPagePrinter...");
            if StartPagePrinter(handle).0 == 0 {
                error!("[send_tspl_to_printer] StartPagePrinter failed");
                let _ = EndDocPrinter(handle);
                ClosePrinter(handle).ok();
                return Err(PrintResponse {
                    status: "error".into(),
                    message: "StartPagePrinter failed.".into(),
                });
            }

            let bytes = tspl_commands.as_bytes();
            let mut written: u32 = 0;
            debug!("[send_tspl_to_printer] Writing {} bytes...", bytes.len());
            let result = WritePrinter(
                handle,
                bytes.as_ptr() as *const _,
                bytes.len() as u32,
                &mut written,
            );

            let _ = EndPagePrinter(handle);
            let _ = EndDocPrinter(handle);
            ClosePrinter(handle).ok();

            if result.0 == 0 || written != (bytes.len() as u32) {
                error!(
                    "[send_tspl_to_printer] WritePrinter failed — result={} written={} expected={}",
                    result.0, written, bytes.len()
                );
                return Err(PrintResponse {
                    status: "error".into(),
                    message: "WritePrinter failed or incomplete.".into(),
                });
            }

            info!("[send_tspl_to_printer] Wrote {} bytes to '{}'", written, printer_name);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        info!("[send_tspl_to_printer] Simulated print on non-Windows");
    }

    Ok(PrintResponse {
        status: "success".into(),
        message: format!("Sent TSPL to {}", printer_name),
    })
}

// ============================================================================
// HTTP SERVER
// ============================================================================

fn with_cors() -> warp::filters::cors::Builder {
    warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type", "authorization", "x-requested-with"])
        .allow_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
}

async fn start_http_server(printer_list: PrinterList) {
    info!("[http_server] Starting on 127.0.0.1:5050");
    let cors = with_cors();

    let printers_route = warp::path!("api" / "printers")
        .and(warp::get())
        .and(warp::any().map(move || printer_list.clone()))
        .and_then(move |list: PrinterList| async move {
            info!("[http_server] GET /api/printers");
            match get_available_printers().await {
                Ok(printers) => {
                    *list.lock().unwrap() = printers.clone();
                    Ok::<_, Infallible>(warp::reply::json(&PrintersResponse {
                        status: "success".into(),
                        printers,
                    }))
                }
                Err(e) => Ok::<_, Infallible>(warp::reply::json(&PrintResponse {
                    status: "error".into(),
                    message: e,
                })),
            }
        });

    let print_route = warp::path!("api" / "print")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(move |req: PrintRequest| async move {
            info!(
                "[http_server] POST /api/print — printer='{}' copies={} products={:?}",
                req.printer_name, req.copies, req.product_ids
            );
            if req.printer_name.is_empty() {
                return Ok::<_, Infallible>(warp::reply::json(&PrintResponse {
                    status: "error".into(),
                    message: "Printer name is required.".into(),
                }));
            }
            if req.tspl_commands.is_empty() {
                return Ok::<_, Infallible>(warp::reply::json(&PrintResponse {
                    status: "error".into(),
                    message: "TSPL commands are required.".into(),
                }));
            }
            match print_to_thermal_printer(
                req.printer_name.clone(),
                req.tspl_commands.clone(),
                Some(req.copies),
            )
            .await
            {
                Ok(resp) => Ok::<_, Infallible>(warp::reply::json(&resp)),
                Err(err) => Ok::<_, Infallible>(warp::reply::json(&err)),
            }
        });

    let health_route = warp::path("health")
        .and(warp::get())
        .map(|| {
            debug!("[http_server] GET /health");
            warp::reply::json(&PrintResponse {
                status: "success".into(),
                message: "Server running.".into(),
            })
        });

    let static_files = warp::path::end()
        .and(warp::fs::file("static/index.html"))
        .or(warp::fs::dir("static/"));

    let routes = printers_route
        .or(print_route)
        .or(health_route)
        .or(static_files)
        .with(&cors);

    info!("[http_server] Listening on 127.0.0.1:5050");
    warp::serve(routes).run(([127, 0, 0, 1], 5050)).await;
}

// ============================================================================
// HTML PRINT COMMAND
// ============================================================================

#[tauri::command]
async fn print_html(app: AppHandle, html: String) -> Result<(), String> {
    use uuid::Uuid;
    #[cfg(target_os = "windows")]
    use std::ffi::OsString;
    #[cfg(target_os = "windows")]
    use std::os::windows::ffi::OsStrExt;

    let label = format!("print-{}", Uuid::new_v4());
    info!("[print_html] Creating print window: {}", label);

    let webview = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("about:blank".into()))
        .title("Print Preview")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;

    let escaped = html
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("'", "\\'");

    webview
        .eval(&format!(
            r#"document.open(); document.write('{}'); document.close();"#,
            escaped
        ))
        .map_err(|e| e.to_string())?;

    tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

    #[cfg(target_os = "windows")]
    {
        let tmp = std::env::temp_dir().join(format!(".html-{}", Uuid::new_v4()));
        info!("[print_html] Writing temp HTML to: {}", tmp.display());
        tokio::fs::write(&tmp, html.as_bytes())
            .await
            .map_err(|e| e.to_string())?;

        let wide_path: Vec<u16> = OsString::from(tmp)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let wide_op: Vec<u16> = OsString::from("print")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        info!("[print_html] ShellExecuteW verb=print (no terminal)");
        unsafe {
            use windows::Win32::UI::Shell::ShellExecuteW;
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
            use windows::core::PCWSTR;

            let res = ShellExecuteW(
                Some(HWND(std::ptr::null_mut())),
                PCWSTR(wide_op.as_ptr()),
                PCWSTR(wide_path.as_ptr()),
                PCWSTR(std::ptr::null()),
                PCWSTR(std::ptr::null()),
                SW_SHOW,
            );
            if (res.0 as isize) <= 32 {
                error!("[print_html] ShellExecuteW failed: code={}", res.0 as isize);
                return Err("Failed to open print dialog.".into());
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        info!("[print_html] webview.print() on non-Windows");
        webview.print().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ============================================================================
// APP LOG DIRECTORY
// ============================================================================

fn get_app_log_dir(_app_handle: AppHandle) -> Option<PathBuf> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let log_dir = exe_dir.join("logs");
            if let Err(e) = std::fs::create_dir_all(&log_dir) {
                eprintln!("Failed to create log directory: {}", e);
                return None;
            }
            return Some(log_dir);
        }
    }
    None
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

// Tauri's own path plugin executableDir()/executable_dir() is NOT "the
// directory containing the running exe" -- it's the XDG-style "user
// executable directory" concept (e.g. ~/.local/bin on Linux), and is
// explicitly documented as unsupported on Windows (dirs::executable_dir()
// returns None there, so the JS call just rejects silently). This is the
// real thing: std::env::current_exe(), which IS supported on Windows.
#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe_path
        .parent()
        .ok_or_else(|| "Executable path has no parent directory".to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

// ============================================================================
// MAIN
// ============================================================================

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Desktop-only local SQLite (registered here, in main.rs, not
        // lib.rs -- Android is a deliberate, frozen "VPS-only, no offline
        // mode" decision, so it has no reason to get this plugin).
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let log_path = if let Some(log_dir) = get_app_log_dir(app.handle().clone()) {
                println!("Log directory: {}", log_dir.display());
                log_dir.join("app.log")
            } else {
                println!("Failed to get app log directory, using default");
                PathBuf::from("app.log")
            };

            app.handle()
                .plugin(
                    tauri_plugin_log::Builder::new()
                        .targets([
                            Target::new(TargetKind::Stdout),
                            Target::new(TargetKind::Folder {
                                path: log_path.parent().unwrap().to_path_buf(),
                                file_name: Some("app".to_string()),
                            }),
                            Target::new(TargetKind::Webview),
                        ])
                        .level(log::LevelFilter::Debug)
                        .build(),
                )
                .expect("Failed to initialize logging plugin");

            info!("=======================================================");
            info!("  APPLICATION SETUP STARTED");
            info!("  Log: {}", log_path.display());
            info!("=======================================================");

            info!("[setup] Starting HTTP server on port 5050...");
            let printers = Arc::new(Mutex::new(vec![]));
            let printers_clone = printers.clone();
            tauri::async_runtime::spawn(async move {
                start_http_server(printers_clone).await;
            });

            info!("[setup] Running initial printer scan...");
            let printers_clone = printers.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(list) = get_available_printers().await {
                    info!("[setup] Initial printer scan: {} printers", list.len());
                    *printers_clone.lock().unwrap() = list;
                }
            });

            info!("=======================================================");
            info!("  APPLICATION SETUP COMPLETE");
            info!("=======================================================");

            // TEMPORARY, for testing -- opens devtools automatically on
            // launch so there's no need to rely on right-click "Inspect"
            // being available. Remove once testing is done (the `devtools`
            // Cargo feature above can stay either way; this is just the
            // auto-open behavior).
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_available_printers,
            send_tspl_to_printer,
            print_to_thermal_printer,
            print_html,
            check_for_updates,
            install_update,
            get_exe_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error building app")
        .run(|_app_handle, _event| {});
}