#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use once_cell::sync::Lazy;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, AppHandle, WindowEvent};
use tauri_plugin_shell::process::CommandEvent;
use warp::Filter;
use serde::{Deserialize, Serialize};
use log::{info, error, warn};
use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_log::{Target, TargetKind};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

// Global state for backend management
static BACKEND_SPAWNING: Lazy<Arc<AtomicBool>> = Lazy::new(|| Arc::new(AtomicBool::new(false)));
static BACKEND_PID: Lazy<Arc<Mutex<Option<u32>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

// Update flag system
use std::fs;

fn get_update_flag_path() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.join("just_updated.flag");
        }
    }
    PathBuf::from("just_updated.flag")
}

fn mark_just_updated() {
    let _ = fs::write(get_update_flag_path(), "1");
}

fn was_just_updated() -> bool {
    let path = get_update_flag_path();
    let exists = path.exists();
    if exists {
        let _ = fs::remove_file(&path);
    }
    exists
}

// UPDATER COMMANDS
#[tauri::command]
async fn check_for_updates(app_handle: AppHandle) -> Result<String, String> {
    info!("Checking for updates...");
    match app_handle.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    info!("Update available: {}", update.version);
                    Ok(format!("Update available: {}", update.version))
                }
                Ok(None) => {
                    info!("No update available.");
                    Ok("No update available.".to_string())
                }
                Err(e) => {
                    error!("Failed to check for updates: {}", e);
                    Err(format!("Failed to check for updates: {}", e))
                }
            }
        }
        Err(e) => {
            error!("Failed to get updater: {}", e);
            Err(format!("Failed to get updater: {}", e))
        }
    }
}

#[tauri::command]
async fn install_update(app_handle: AppHandle) -> Result<String, String> {
    info!("Installing update...");

    // Gracefully shutdown backend
    shutdown_backend().await;
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    // fallback kill
    kill_all_backend_processes();

    // mark update restart
    mark_just_updated();

    match app_handle.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    info!("Update found, downloading...");
                    let _ = update.download_and_install(|_, _| {}, || {}).await;
                    info!("Update installed. Restarting...");
                    app_handle.restart();
                }
                Ok(None) => Ok("No update available".into()),
                Err(e) => Err(format!("Check failed: {}", e)),
            }
        }
        Err(e) => Err(format!("Updater error: {}", e)),
    }
}

// PRINTER COMMANDS (unchanged - keeping your working code)
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

#[tauri::command]
async fn print_to_thermal_printer(
    printer_name: String,
    tspl_commands: String,
    copies: Option<i32>,
) -> Result<PrintResponse, PrintResponse> {
    info!("Printing to thermal printer: {}", printer_name);
    info!("TSPL Commands: {}", tspl_commands);

    let copies = copies.unwrap_or(1);
    let mut final_response = PrintResponse {
        status: "success".into(),
        message: "Print job completed successfully.".into(),
    };

    for copy_num in 1..=copies {
        info!("Printing copy {} / {}", copy_num, copies);
        let result = send_tspl_to_printer(printer_name.clone(), tspl_commands.clone()).await;
        if let Err(err) = result {
            error!("Failed at copy {}: {:?}", copy_num, err);
            final_response = err;
            break;
        }
    }

    Ok(final_response)
}

#[tauri::command]
async fn get_available_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    use std::process::Command;
    info!("Searching for available printers...");

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("wmic")
            .args(["printer", "get", "name"])
            .output()
            .map_err(|e| format!("Failed to get printers: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let printers: Vec<String> = stdout
            .lines()
            .skip(1)
            .filter(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .collect();
        info!("Found {} printers: {:?}", printers.len(), printers);
        Ok(printers)
    }

    #[cfg(not(target_os = "windows"))]
    {
        info!("Using default printer (non-Windows)");
        Ok(vec!["Default Printer".into()])
    }
}

#[tauri::command]
async fn send_tspl_to_printer(
    printer_name: String,
    tspl_commands: String,
) -> Result<PrintResponse, PrintResponse> {
    info!("Sending TSPL commands to printer: {}", printer_name);

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
            let name_cstr = CString::new(printer_name.clone())
                .map_err(|e| PrintResponse {
                    status: "error".into(),
                    message: format!("Invalid printer name: {}", e),
                })?;

            let mut handle: PRINTER_HANDLE = PRINTER_HANDLE::default();

            let defaults = PRINTER_DEFAULTSA {
                pDatatype: PSTR(std::ptr::null_mut()),
                pDevMode: ptr::null_mut(),
                DesiredAccess: PRINTER_ACCESS_USE | PRINTER_ACCESS_ADMINISTER,
            };

            if OpenPrinterA(PCSTR(name_cstr.as_ptr() as _), &mut handle, Some(&defaults)).is_err() {
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

            let job_id = StartDocPrinterA(handle, 1, &mut doc_info);
            if job_id == 0 {
                ClosePrinter(handle).ok();
                return Err(PrintResponse {
                    status: "error".into(),
                    message: "StartDocPrinterA failed.".into(),
                });
            }

            if StartPagePrinter(handle).0 == 0 {
                let _ = EndDocPrinter(handle);
                ClosePrinter(handle).ok();
                return Err(PrintResponse {
                    status: "error".into(),
                    message: "StartPagePrinter failed.".into(),
                });
            }

            let bytes = tspl_commands.as_bytes();
            let mut written: u32 = 0;
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
                return Err(PrintResponse {
                    status: "error".into(),
                    message: "WritePrinter failed or incomplete.".into(),
                });
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        info!("Simulated print on non-Windows system");
    }

    Ok(PrintResponse {
        status: "success".into(),
        message: format!("Sent TSPL to {}", printer_name),
    })
}

// HTTP SERVER (unchanged)
fn with_cors() -> warp::filters::cors::Builder {
    warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type", "authorization", "x-requested-with"])
        .allow_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
}

async fn start_http_server(printer_list: PrinterList) {
    let cors = with_cors();

    let printers_route = warp::path!("api" / "printers")
        .and(warp::get())
        .and(warp::any().map(move || printer_list.clone()))
        .and_then(move |list: PrinterList| async move {
            info!("API GET /api/printers");
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
            info!("API POST /api/print: {:?}", req);
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
            info!("API GET /health");
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

    warp::serve(routes).run(([127, 0, 0, 1], 5050)).await;
}

// HTML PRINT COMMAND (unchanged)
#[tauri::command]
async fn print_html(app: AppHandle, html: String) -> Result<(), String> {
    use uuid::Uuid;
    #[cfg(target_os = "windows")]
    use std::ffi::OsString;
    #[cfg(target_os = "windows")]
    use std::os::windows::ffi::OsStrExt;

    let label = format!("print-{}", Uuid::new_v4());
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
        tokio::fs::write(&tmp, html.as_bytes()).await.map_err(|e| e.to_string())?;

        let wide_path: Vec<u16> = OsString::from(tmp)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let wide_op: Vec<u16> = OsString::from("print")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            #[cfg(target_os = "windows")]
            use windows::Win32::UI::Shell::ShellExecuteW;
            #[cfg(target_os = "windows")]
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
            #[cfg(target_os = "windows")]
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
                return Err("Failed to open print dialog.".into());
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        webview.print().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// BACKEND MANAGEMENT FUNCTIONS
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

async fn is_backend_running() -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    match client
        .get("http://127.0.0.1:8080/health")
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            info!("Backend already running and healthy");
            true
        }
        _ => {
            info!("Backend not responding");
            false
        }
    }
}

fn kill_all_backend_processes() {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        info!("Terminating all Siriadmin-backend processes...");

        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "Siriadmin-backend.exe", "/T"])
            .output();

        let output = Command::new("cmd")
            .args(["/C", "for /f \"tokens=5\" %a in ('netstat -ano | findstr :8080 | findstr LISTENING') do echo %a"])
            .output();

        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                let pid = pid.trim();
                if !pid.is_empty() {
                    info!("Killing process on port 8080 with PID: {}", pid);
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", pid])
                        .output();
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(1000));
        info!("Backend process cleanup complete");
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        info!("Terminating all Siriadmin-backend processes...");

        let _ = Command::new("pkill")
            .args(["-9", "Siriadmin-backend"])
            .output();

        let output = Command::new("lsof")
            .args(["-ti:8080"])
            .output()
            .and_then(|output| String::from_utf8(output.stdout));

        if let Ok(pids) = output {
            for pid in pids.lines() {
                Command::new("kill")
                    .args(["-9", pid])
                    .output()
                    .ok();
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(1000));
    }
}

fn spawn_sidecar(app_handle: &AppHandle) -> Result<(), String> {
    if BACKEND_SPAWNING.load(Ordering::SeqCst) {
        warn!("Backend spawn already in progress, skipping...");
        return Err("Backend spawn already in progress.".to_string());
    }

    BACKEND_SPAWNING.store(true, Ordering::SeqCst);

    info!("ATTEMPTING TO SPAWN SIDECAR");
    info!("Creating sidecar command for Siriadmin-backend...");

    let cmd = match app_handle.shell().sidecar("Siriadmin-backend") {
        Ok(cmd) => {
            info!("Sidecar command created successfully");
            cmd
        }
        Err(e) => {
            BACKEND_SPAWNING.store(false, Ordering::SeqCst);
            error!("Failed to create sidecar command: {}", e);
            error!("Make sure Siriadmin-backend is configured in tauri.conf.json under bundle.externalBin...");
            return Err(format!("Failed to create sidecar command: {}", e));
        }
    };

    info!("Spawning sidecar process...");
    let (mut rx, command_child) = match cmd.spawn() {
        Ok(result) => {
            info!("Sidecar spawn initiated");
            result
        }
        Err(e) => {
            BACKEND_SPAWNING.store(false, Ordering::SeqCst);
            error!("Failed to spawn sidecar: {}", e);
            error!("Check if the binary exists and has execute permissions");
            return Err(format!("Failed to spawn sidecar: {}", e));
        }
    };

    let pid = command_child.pid();
    info!("SIDECAR SPAWNED SUCCESSFULLY WITH PID: {}", pid);

    *BACKEND_PID.lock().unwrap() = Some(pid);

    let pid_for_monitor = pid;
    tauri::async_runtime::spawn(async move {
        info!("Sidecar output monitor started for PID: {}", pid_for_monitor);
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let output = String::from_utf8_lossy(&line);
                    info!("Sidecar PID {} stdout: {}", pid_for_monitor, output);
                }
                CommandEvent::Stderr(line) => {
                    let output = String::from_utf8_lossy(&line);
                    error!("Sidecar PID {} stderr: {}", pid_for_monitor, output);
                }
                CommandEvent::Error(err) => {
                    error!("Sidecar PID {} error: {}", pid_for_monitor, err);
                }
                CommandEvent::Terminated(payload) => {
                    warn!(
                        "Sidecar PID {} terminated with code: {:?}",
                        pid_for_monitor,
                        payload.code
                    );
                    BACKEND_SPAWNING.store(false, Ordering::SeqCst);
                    *BACKEND_PID.lock().unwrap() = None;
                }
                _ => {}
            }
        }
        warn!("Sidecar PID {} output stream ended", pid_for_monitor);

        let spawning_flag = BACKEND_SPAWNING.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            spawning_flag.store(false, Ordering::SeqCst);
        });
        info!("SIDECAR INITIALIZATION COMPLETE");
    });

    Ok(())
}

// Retry spawn logic
async fn spawn_backend_with_retry(app: AppHandle) {
    for attempt in 1..=5 {
        info!("Backend spawn attempt {}", attempt);

        if spawn_sidecar(&app).is_ok() {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;

            if is_backend_running().await {
                info!("Backend ready!");
                return;
            }
        }

        warn!("Retrying backend spawn...");
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }

    error!("Backend failed after retries");
}

async fn shutdown_backend() {
    info!("Sending shutdown request...");
    let client = reqwest::Client::new();

    let _ = client
        .post("http://127.0.0.1:8080/api/shutdown")
        .send()
        .await;

    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
}

#[tauri::command]
async fn ensure_backend_running(app_handle: AppHandle) -> Result<String, String> {
    info!("Checking backend status via health endpoint...");

    if BACKEND_SPAWNING.load(Ordering::SeqCst) {
        return Ok("Backend spawn in progress.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    match client
        .get("http://127.0.0.1:8080/health")
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => Ok("Backend running.".to_string()),
        _ => {
            warn!("Backend not responding, attempting to spawn...");
            match spawn_sidecar(&app_handle) {
                Ok(_) => Ok("Backend started.".to_string()),
                Err(e) => Err(format!("Failed to start backend: {}", e)),
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
                        .level(log::LevelFilter::Info)
                        .build(),
                )
                .expect("Failed to initialize logging plugin");

            info!("");
            info!("APPLICATION SETUP STARTED");
            info!("Log file location: {}", log_path.display());
            info!("");

            // Starting backend lifecycle manager (UPDATED)
            info!("🔧 Starting backend lifecycle manager...");
            let handle = app.app_handle().clone();

            tauri::async_runtime::spawn(async move {
                let just_updated = was_just_updated();

                if !just_updated {
                    info!("Cleaning previous backend...");
                    kill_all_backend_processes();
                } else {
                    info!("App restarted after update. Waiting for Windows file unlock...");
                    tokio::time::sleep(std::time::Duration::from_secs(6)).await;
                }

                if is_backend_running().await {
                    info!("Backend already running.");
                    return;
                }

                spawn_backend_with_retry(handle.clone()).await;
            });

            info!("Starting HTTP server on port 5050...");
            let printers = Arc::new(Mutex::new(vec![]));
            let printers_clone = printers.clone();
            tauri::async_runtime::spawn(async move {
                info!("HTTP server task started...");
                start_http_server(printers_clone).await;
            });

            info!("Scanning for available printers...");
            let printers_clone = printers.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(list) = get_available_printers().await {
                    info!("Initial printer scan found {} printers", list.len());
                    *printers_clone.lock().unwrap() = list;
                }
            });

            if let Some(main_win) = app.get_webview_window("main") {
                info!("Registering window close event handler");
                main_win.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        info!("Window close requested, shutting down backend...");
                        tauri::async_runtime::block_on(async {
                            shutdown_backend().await;
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            kill_all_backend_processes();
                        });
                    }
                });
            }

            info!("");
            info!("APPLICATION SETUP COMPLETE");
            info!("");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_available_printers,
            send_tspl_to_printer,
            print_to_thermal_printer,
            print_html,
            check_for_updates,
            install_update,
            ensure_backend_running,
        ])
        .build(tauri::generate_context!())
        .expect("error building app")
        .run(|_app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                info!("Application exit event received");
                tauri::async_runtime::block_on(async {
                    shutdown_backend().await;
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    kill_all_backend_processes();
                });
            }
        });
}
