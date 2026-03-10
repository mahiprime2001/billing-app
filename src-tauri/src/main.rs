#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use once_cell::sync::Lazy;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, AppHandle, WindowEvent};
use tauri_plugin_shell::process::CommandEvent;
use warp::Filter;
use serde::{Deserialize, Serialize};
use log::{info, error, warn, debug};
use std::path::PathBuf;
use std::fs;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_log::{Target, TargetKind};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

// ============================================================================
// GLOBAL STATE
// ============================================================================

static BACKEND_SPAWNING: Lazy<Arc<AtomicBool>> = Lazy::new(|| Arc::new(AtomicBool::new(false)));
static BACKEND_PID: Lazy<Arc<Mutex<Option<u32>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

// True once the setup task finishes kill + cleanup and opens the spawn gate.
// ensure_backend_running returns early until this is set, preventing any race
// between the frontend calling in before cleanup is done.
static SETUP_READY: Lazy<Arc<AtomicBool>> = Lazy::new(|| Arc::new(AtomicBool::new(false)));

// Tracks the last sidecar exit code so the retry loop can make decisions:
//   -1  = PyInstaller "Could not create temporary directory" (retryable after cleanup)
//    0  = clean exit
//   1+  = hard crash (bad import, unhandled exception — NOT retryable)
static LAST_EXIT_CODE: Lazy<Arc<AtomicI32>> = Lazy::new(|| Arc::new(AtomicI32::new(0)));

// Set by the stderr monitor when it sees the PyInstaller temp dir error.
// Cleared at the top of spawn_sidecar for each new attempt.
static PYINSTALLER_TEMP_ERROR: Lazy<Arc<AtomicBool>> =
    Lazy::new(|| Arc::new(AtomicBool::new(false)));

// Prevents double-shutdown from CloseRequested + RunEvent::Exit both firing
static SHUTDOWN_CALLED: Lazy<Arc<AtomicBool>> = Lazy::new(|| Arc::new(AtomicBool::new(false)));

// ============================================================================
// UPDATE FLAG SYSTEM
// ============================================================================

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

// ============================================================================
// PYINSTALLER TEMP CLEANUP
//
// PyInstaller --onefile extracts to a _MEIxxxxxx folder in %TEMP% on startup.
// When the process is force-killed (taskkill /F) Windows keeps a file lock on
// that folder for a short time after. The next launch fails immediately with:
//   [PYI-XXXXX:ERROR] Could not create temporary directory!
//
// We call this function:
//   1. On every startup after killing leftover processes
//   2. Before each retry attempt when PYINSTALLER_TEMP_ERROR is detected
// ============================================================================

fn cleanup_pyinstaller_temp() {
    #[cfg(target_os = "windows")]
    {
        let temp_dir = std::env::var("TEMP")
            .or_else(|_| std::env::var("TMP"))
            .unwrap_or_else(|_| "C:\\Windows\\Temp".to_string());

        info!("[cleanup_pyinstaller_temp] Scanning for _MEI* dirs in: {}", temp_dir);

        match fs::read_dir(&temp_dir) {
            Ok(entries) => {
                let mut removed = 0;
                let mut locked = 0;
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("_MEI") {
                        match fs::remove_dir_all(entry.path()) {
                            Ok(_) => {
                                info!("[cleanup_pyinstaller_temp] Removed: {}", name_str);
                                removed += 1;
                            }
                            Err(e) => {
                                warn!(
                                    "[cleanup_pyinstaller_temp] Still locked — cannot remove {}: {}",
                                    name_str, e
                                );
                                locked += 1;
                            }
                        }
                    }
                }
                info!(
                    "[cleanup_pyinstaller_temp] Done — removed={} still_locked={}",
                    removed, locked
                );
            }
            Err(e) => warn!("[cleanup_pyinstaller_temp] Cannot read temp dir: {}", e),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        debug!("[cleanup_pyinstaller_temp] Not Windows, skipping");
    }
}

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

    // Close the spawn gate so nothing re-spawns during the update
    SETUP_READY.store(false, Ordering::SeqCst);
    info!("[install_update] Spawn gate closed");

    shutdown_backend().await;
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    kill_all_backend_processes();
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    cleanup_pyinstaller_temp();
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    mark_just_updated();
    info!("[install_update] Update flag written — next boot will wait before spawning");

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
                        SETUP_READY.store(true, Ordering::SeqCst);
                        return Err(format!("Failed to download/install update: {}", e));
                    }
                }
            }
            Ok(None) => {
                SETUP_READY.store(true, Ordering::SeqCst);
                return Ok("No update available.".into());
            }
            Err(e) => {
                SETUP_READY.store(true, Ordering::SeqCst);
                return Err(format!("Update check failed: {}", e));
            }
        },
        Err(e) => {
            SETUP_READY.store(true, Ordering::SeqCst);
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
// BACKEND MANAGEMENT
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

async fn is_backend_running() -> bool {
    debug!("[is_backend_running] Checking http://127.0.0.1:8080/health ...");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    match client.get("http://127.0.0.1:8080/health").send().await {
        Ok(r) if r.status().is_success() => {
            info!("[is_backend_running] Backend is healthy");
            true
        }
        Ok(r) => {
            warn!("[is_backend_running] Backend unhealthy: {}", r.status());
            false
        }
        Err(e) => {
            debug!("[is_backend_running] Not responding: {}", e);
            false
        }
    }
}

fn kill_all_backend_processes() {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        info!("[kill_all_backend_processes] taskkill /F /IM Siriadmin-backend.exe /T");
        let result = Command::new("taskkill")
            .args(["/F", "/IM", "Siriadmin-backend.exe", "/T"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        match result {
            Ok(out) => {
                let msg = String::from_utf8_lossy(&out.stdout);
                let t = msg.trim();
                if !t.is_empty() {
                    debug!("[kill_all_backend_processes] {}", t);
                }
            }
            Err(e) => warn!("[kill_all_backend_processes] taskkill error: {}", e),
        }

        info!("[kill_all_backend_processes] Scanning netstat for port 8080 holders");
        let output = Command::new("cmd")
            .args([
                "/C",
                "for /f \"tokens=5\" %a in ('netstat -ano | findstr :8080 | findstr LISTENING') do echo %a",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                let pid = pid.trim();
                if !pid.is_empty() {
                    info!("[kill_all_backend_processes] Killing PID {} on port 8080", pid);
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", pid])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
        info!("[kill_all_backend_processes] Done");
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        info!("[kill_all_backend_processes] pkill -9 Siriadmin-backend");
        let _ = Command::new("pkill").args(["-9", "Siriadmin-backend"]).output();

        if let Ok(pids) = Command::new("lsof")
            .args(["-ti:8080"])
            .output()
            .and_then(|o| String::from_utf8(o.stdout))
        {
            for pid in pids.lines() {
                info!("[kill_all_backend_processes] Killing PID {} on port 8080", pid);
                Command::new("kill").args(["-9", pid]).output().ok();
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
        info!("[kill_all_backend_processes] Done");
    }
}

fn spawn_sidecar(app_handle: &AppHandle) -> Result<(), String> {
    if BACKEND_SPAWNING.load(Ordering::SeqCst) {
        warn!("[spawn_sidecar] Already spawning, skipping duplicate");
        return Err("Backend spawn already in progress.".to_string());
    }

    // Reset state for this new attempt
    LAST_EXIT_CODE.store(0, Ordering::SeqCst);
    PYINSTALLER_TEMP_ERROR.store(false, Ordering::SeqCst);
    BACKEND_SPAWNING.store(true, Ordering::SeqCst);

    info!("[spawn_sidecar] Creating sidecar command for Siriadmin-backend...");
    let cmd = match app_handle.shell().sidecar("Siriadmin-backend") {
        Ok(cmd) => {
            info!("[spawn_sidecar] Command created");
            cmd
        }
        Err(e) => {
            BACKEND_SPAWNING.store(false, Ordering::SeqCst);
            error!("[spawn_sidecar] Failed: {} — check tauri.conf.json bundle.externalBin", e);
            return Err(format!("Failed to create sidecar command: {}", e));
        }
    };

    let temp_path = std::env::temp_dir();
    let temp_str = temp_path.to_str().unwrap_or("C:\\Windows\\Temp");
    info!("[spawn_sidecar] Spawning with TEMP/TMP={}", temp_str);

    let (mut rx, child) = match cmd.env("TEMP", temp_str).env("TMP", temp_str).spawn() {
        Ok(r) => r,
        Err(e) => {
            BACKEND_SPAWNING.store(false, Ordering::SeqCst);
            error!("[spawn_sidecar] Spawn failed: {}", e);
            return Err(format!("Failed to spawn sidecar: {}", e));
        }
    };

    let pid = child.pid();
    info!("[spawn_sidecar] Sidecar running with PID: {}", pid);
    *BACKEND_PID.lock().unwrap() = Some(pid);

    tauri::async_runtime::spawn(async move {
        info!("[sidecar PID={}] Output monitor started", pid);
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    info!("[sidecar PID={}] stdout: {}", pid, String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    // Detect PyInstaller temp dir failure before logging
                    if text.contains("Could not create temporary directory") {
                        error!(
                            "[sidecar PID={}] PyInstaller temp dir error — \
                             will run cleanup before next retry",
                            pid
                        );
                        PYINSTALLER_TEMP_ERROR.store(true, Ordering::SeqCst);
                    } else {
                        // Flask/Gunicorn write normal INFO to stderr — shown as
                        // ERROR level so it's easy to spot in the log file
                        error!("[sidecar PID={}] stderr: {}", pid, text);
                    }
                }
                CommandEvent::Error(err) => {
                    error!("[sidecar PID={}] process error: {}", pid, err);
                }
                CommandEvent::Terminated(payload) => {
                    let code = payload.code.unwrap_or(-1);
                    if code == 0 {
                        info!("[sidecar PID={}] exited cleanly (code 0)", pid);
                    } else {
                        error!("[sidecar PID={}] exited with code {} — check stderr above", pid, code);
                    }
                    LAST_EXIT_CODE.store(code as i32, Ordering::SeqCst);
                    BACKEND_SPAWNING.store(false, Ordering::SeqCst);
                    *BACKEND_PID.lock().unwrap() = None;
                }
                _ => {}
            }
        }
        warn!("[sidecar PID={}] output stream closed", pid);
        BACKEND_SPAWNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

async fn spawn_backend_with_retry(app: AppHandle) {
    for attempt in 1..=5 {
        // Wait for any in-progress spawn to complete (up to 15s)
        if BACKEND_SPAWNING.load(Ordering::SeqCst) {
            info!("[spawn_backend_with_retry] Spawn in progress, waiting (attempt {})...", attempt);
            for _ in 0..15 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                if !BACKEND_SPAWNING.load(Ordering::SeqCst) {
                    break;
                }
            }
            if is_backend_running().await {
                info!("[spawn_backend_with_retry] Backend came up while waiting — done");
                return;
            }
            continue;
        }

        // If last attempt hit a PyInstaller temp dir error, clean up before retrying
        if PYINSTALLER_TEMP_ERROR.load(Ordering::SeqCst) {
            warn!(
                "[spawn_backend_with_retry] Temp dir error on last attempt — \
                 cleaning _MEI* dirs before attempt {}",
                attempt
            );
            cleanup_pyinstaller_temp();
            info!("[spawn_backend_with_retry] Waiting 3s for Windows to release file locks...");
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }

        // Hard crash (missing module etc.) — retrying won't help
        let last_code = LAST_EXIT_CODE.load(Ordering::SeqCst);
        if last_code > 0 {
            error!(
                "[spawn_backend_with_retry] Sidecar crashed (exit code {}) — \
                 aborting retries. Fix the backend binary and restart the app.",
                last_code
            );
            return;
        }

        info!("[spawn_backend_with_retry] Attempt {}/5", attempt);

        if spawn_sidecar(&app).is_ok() {
            info!("[spawn_backend_with_retry] Waiting 5s for backend to initialize...");
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;

            // Crashed during startup
            let code_after = LAST_EXIT_CODE.load(Ordering::SeqCst);
            if code_after > 0 {
                error!(
                    "[spawn_backend_with_retry] Sidecar crashed on startup (code {}) — aborting",
                    code_after
                );
                return;
            }

            // Temp dir error during startup — loop will clean up on next iteration
            if PYINSTALLER_TEMP_ERROR.load(Ordering::SeqCst) {
                warn!("[spawn_backend_with_retry] Temp dir error during startup — will retry with cleanup");
                continue;
            }

            if is_backend_running().await {
                info!("[spawn_backend_with_retry] Backend is ready!");
                return;
            }
            warn!("[spawn_backend_with_retry] Backend did not respond after attempt {}", attempt);
        } else {
            warn!("[spawn_backend_with_retry] spawn_sidecar error on attempt {}", attempt);
        }

        if attempt < 5 {
            info!("[spawn_backend_with_retry] Waiting 2s before next attempt...");
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }

    error!("[spawn_backend_with_retry] Backend failed to start after 5 attempts");
}

async fn shutdown_backend() {
    info!("[shutdown_backend] POST http://127.0.0.1:8080/api/shutdown ...");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    match client.post("http://127.0.0.1:8080/api/shutdown").send().await {
        Ok(_) => info!("[shutdown_backend] Accepted"),
        Err(e) => warn!("[shutdown_backend] Failed (may already be down): {}", e),
    }

    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
}

async fn do_shutdown() {
    if SHUTDOWN_CALLED.swap(true, Ordering::SeqCst) {
        info!("[do_shutdown] Already called, skipping duplicate");
        return;
    }
    info!("[do_shutdown] Initiating graceful shutdown...");
    shutdown_backend().await;
    std::thread::sleep(std::time::Duration::from_millis(500));
    kill_all_backend_processes();
    info!("[do_shutdown] Complete");
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
async fn ensure_backend_running(app_handle: AppHandle) -> Result<String, String> {
    info!("[ensure_backend_running] Called from frontend");

    // FIX: Block until setup completes kill + cleanup + lock release.
    // The frontend calls this almost immediately on boot, before the setup
    // async task has finished killing old processes and cleaning _MEI* dirs.
    // Instead of racing, we poll with a timeout until the gate opens.
    if !SETUP_READY.load(Ordering::SeqCst) {
        info!("[ensure_backend_running] Waiting for setup to complete (max 15s)...");
        for i in 0..15 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            if SETUP_READY.load(Ordering::SeqCst) {
                info!("[ensure_backend_running] Setup ready after {}s", i + 1);
                break;
            }
        }
        if !SETUP_READY.load(Ordering::SeqCst) {
            warn!("[ensure_backend_running] Setup did not complete in 15s, proceeding anyway");
        }
    }

    if BACKEND_SPAWNING.load(Ordering::SeqCst) {
        info!("[ensure_backend_running] Spawn already in progress");
        return Ok("Backend spawn in progress.".to_string());
    }

    if is_backend_running().await {
        info!("[ensure_backend_running] Backend already running");
        return Ok("Backend running.".to_string());
    }

    warn!("[ensure_backend_running] Backend not responding after setup — attempting spawn");
    match spawn_sidecar(&app_handle) {
        Ok(_) => Ok("Backend started.".to_string()),
        Err(e) => Err(format!("Failed to start backend: {}", e)),
    }
}

// ============================================================================
// MAIN
// ============================================================================

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
                        .level(log::LevelFilter::Debug)
                        .build(),
                )
                .expect("Failed to initialize logging plugin");

            info!("=======================================================");
            info!("  APPLICATION SETUP STARTED");
            info!("  Log: {}", log_path.display());
            info!("=======================================================");

            let handle = app.app_handle().clone();

            tauri::async_runtime::spawn(async move {
                let just_updated = was_just_updated();

                if just_updated {
                    // After an update restart Windows holds file locks on the
                    // old _MEI* dir. Wait before attempting cleanup + spawn.
                    info!("[setup] Post-update restart — waiting 10s for lock release...");
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                    cleanup_pyinstaller_temp();
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                } else {
                    // Normal startup:
                    // Step 1 — kill old process
                    info!("[setup] Normal startup — killing leftover backend processes...");
                    kill_all_backend_processes();

                    // Step 2 — wait for Windows to release the file lock the
                    // killed process held on its _MEI* dir. This is the key fix:
                    // cleanup immediately after kill still sees locked dirs.
                    info!("[setup] Waiting 3s for Windows file lock release...");
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

                    // Step 3 — now clean up (lock should be gone)
                    info!("[setup] Cleaning PyInstaller temp dirs...");
                    cleanup_pyinstaller_temp();

                    // Step 4 — brief extra wait before spawning
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }

                // Open the gate — ensure_backend_running can proceed now
                SETUP_READY.store(true, Ordering::SeqCst);
                info!("[setup] Setup ready — spawn gate open");

                if is_backend_running().await {
                    info!("[setup] Backend already running, skipping spawn");
                    return;
                }

                info!("[setup] Spawning backend...");
                spawn_backend_with_retry(handle.clone()).await;
            });

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

            if let Some(main_win) = app.get_webview_window("main") {
                info!("[setup] Registering CloseRequested handler");
                main_win.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        info!("[window] CloseRequested — triggering shutdown");
                        tauri::async_runtime::block_on(async {
                            do_shutdown().await;
                        });
                    }
                });
            }

            info!("=======================================================");
            info!("  APPLICATION SETUP COMPLETE");
            info!("=======================================================");
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
                info!("[run] RunEvent::Exit — triggering shutdown");
                tauri::async_runtime::block_on(async {
                    do_shutdown().await;
                });
            }
        });
}