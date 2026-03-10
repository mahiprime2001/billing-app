#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
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
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("_MEI") {
                        info!("[cleanup_pyinstaller_temp] Removing: {}", name_str);
                        if let Err(e) = fs::remove_dir_all(entry.path()) {
                            warn!("[cleanup_pyinstaller_temp] Could not remove {}: {}", name_str, e);
                        }
                    }
                }
                info!("[cleanup_pyinstaller_temp] Done");
            }
            Err(e) => {
                warn!("[cleanup_pyinstaller_temp] Could not read temp dir: {}", e);
            }
        }
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

    shutdown_backend().await;
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    kill_all_backend_processes();
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    cleanup_pyinstaller_temp();
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    mark_just_updated();

    match app_handle.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                info!("[install_update] Downloading and installing v{}...", update.version);
                match update.download_and_install(
                    |chunk, total| {
                        debug!("[install_update] Download progress: {} / {:?}", chunk, total);
                    },
                    || {
                        info!("[install_update] Download complete, applying...");
                    },
                )
                .await
                {
                    Ok(_) => {
                        info!("[install_update] Installed. Restarting app...");
                        app_handle.restart();
                    }
                    Err(e) => {
                        error!("[install_update] download_and_install failed: {}", e);
                        return Err(format!("Failed to download/install update: {}", e));
                    }
                }
            }
            Ok(None) => return Ok("No update available.".into()),
            Err(e) => return Err(format!("Update check failed: {}", e)),
        },
        Err(e) => return Err(format!("Updater error: {}", e)),
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

        // FIX: CREATE_NO_WINDOW prevents wmic from flashing a terminal window
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
            debug!("[send_tspl_to_printer] Writing {} bytes to printer...", bytes.len());
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

            info!("[send_tspl_to_printer] Successfully wrote {} bytes to '{}'", written, printer_name);
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
    info!("[print_html] Creating print window with label: {}", label);

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

        info!("[print_html] Calling ShellExecuteW with verb=print (no terminal window)");
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
                error!("[print_html] ShellExecuteW failed with code: {}", res.0 as isize);
                return Err("Failed to open print dialog.".into());
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        info!("[print_html] Calling webview.print() on non-Windows");
        webview.print().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ============================================================================
// BACKEND MANAGEMENT FUNCTIONS
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
        Ok(response) if response.status().is_success() => {
            info!("[is_backend_running] Backend is healthy");
            true
        }
        Ok(response) => {
            warn!("[is_backend_running] Backend responded with status: {}", response.status());
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

        info!("[kill_all_backend_processes] Running: taskkill /F /IM Siriadmin-backend.exe /T (no window)");
        let result = Command::new("taskkill")
            .args(["/F", "/IM", "Siriadmin-backend.exe", "/T"])
            .creation_flags(CREATE_NO_WINDOW) // FIX: prevents terminal flash
            .output();
        match result {
            Ok(out) => debug!(
                "[kill_all_backend_processes] taskkill output: {}",
                String::from_utf8_lossy(&out.stdout).trim()
            ),
            Err(e) => warn!("[kill_all_backend_processes] taskkill failed: {}", e),
        }

        // Find and kill anything holding port 8080
        info!("[kill_all_backend_processes] Running: netstat -ano to find port 8080 holders (no window)");
        let output = Command::new("cmd")
            .args([
                "/C",
                "for /f \"tokens=5\" %a in ('netstat -ano | findstr :8080 | findstr LISTENING') do echo %a",
            ])
            .creation_flags(CREATE_NO_WINDOW) // FIX: prevents terminal flash
            .output();

        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                let pid = pid.trim();
                if !pid.is_empty() {
                    info!("[kill_all_backend_processes] Killing PID {} on port 8080", pid);
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", pid])
                        .creation_flags(CREATE_NO_WINDOW) // FIX: prevents terminal flash
                        .output();
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(1000));
        info!("[kill_all_backend_processes] Done");
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        info!("[kill_all_backend_processes] Running: pkill -9 Siriadmin-backend");
        let _ = Command::new("pkill")
            .args(["-9", "Siriadmin-backend"])
            .output();

        info!("[kill_all_backend_processes] Running: lsof -ti:8080 to find port holders");
        let output = Command::new("lsof")
            .args(["-ti:8080"])
            .output()
            .and_then(|output| String::from_utf8(output.stdout));

        if let Ok(pids) = output {
            for pid in pids.lines() {
                info!("[kill_all_backend_processes] Killing PID {} on port 8080", pid);
                Command::new("kill").args(["-9", pid]).output().ok();
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(1000));
        info!("[kill_all_backend_processes] Done");
    }
}

fn spawn_sidecar(app_handle: &AppHandle) -> Result<(), String> {
    if BACKEND_SPAWNING.load(Ordering::SeqCst) {
        warn!("[spawn_sidecar] Already spawning, skipping duplicate request");
        return Err("Backend spawn already in progress.".to_string());
    }

    BACKEND_SPAWNING.store(true, Ordering::SeqCst);
    info!("[spawn_sidecar] Creating sidecar command for Siriadmin-backend...");

    let cmd = match app_handle.shell().sidecar("Siriadmin-backend") {
        Ok(cmd) => {
            info!("[spawn_sidecar] Sidecar command created");
            cmd
        }
        Err(e) => {
            BACKEND_SPAWNING.store(false, Ordering::SeqCst);
            error!("[spawn_sidecar] Failed to create sidecar command: {}", e);
            error!("[spawn_sidecar] Ensure Siriadmin-backend is listed in tauri.conf.json -> bundle.externalBin");
            return Err(format!("Failed to create sidecar command: {}", e));
        }
    };

    let temp_path = std::env::temp_dir();
    let temp_str = temp_path.to_str().unwrap_or("C:\\Windows\\Temp");
    info!("[spawn_sidecar] Spawning with TEMP/TMP={}", temp_str);

    let (mut rx, command_child) = match cmd
        .env("TEMP", temp_str)
        .env("TMP", temp_str)
        .spawn()
    {
        Ok(result) => {
            info!("[spawn_sidecar] Spawn initiated");
            result
        }
        Err(e) => {
            BACKEND_SPAWNING.store(false, Ordering::SeqCst);
            error!("[spawn_sidecar] Spawn failed: {}", e);
            return Err(format!("Failed to spawn sidecar: {}", e));
        }
    };

    let pid = command_child.pid();
    info!("[spawn_sidecar] Sidecar spawned with PID: {}", pid);
    *BACKEND_PID.lock().unwrap() = Some(pid);

    tauri::async_runtime::spawn(async move {
        info!("[spawn_sidecar] Output monitor started for PID {}", pid);
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let output = String::from_utf8_lossy(&line);
                    info!("[sidecar PID={}] stdout: {}", pid, output);
                }
                CommandEvent::Stderr(line) => {
                    let output = String::from_utf8_lossy(&line);
                    error!("[sidecar PID={}] stderr: {}", pid, output);
                }
                CommandEvent::Error(err) => {
                    error!("[sidecar PID={}] error event: {}", pid, err);
                }
                CommandEvent::Terminated(payload) => {
                    warn!(
                        "[sidecar PID={}] terminated — exit code: {:?}",
                        pid, payload.code
                    );
                    BACKEND_SPAWNING.store(false, Ordering::SeqCst);
                    *BACKEND_PID.lock().unwrap() = None;
                }
                _ => {}
            }
        }
        warn!("[sidecar PID={}] output stream closed", pid);
        // Safety net: clear spawning flag even if Terminated event was not received
        BACKEND_SPAWNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

// FIX: Properly waits for any in-progress spawn to complete before retrying.
// Old code would keep calling spawn_sidecar while BACKEND_SPAWNING=true,
// causing multiple terminal flashes and "already in progress" spam.
async fn spawn_backend_with_retry(app: AppHandle) {
    for attempt in 1..=5 {
        // If a spawn is already in progress, wait for it to finish (up to 15s)
        if BACKEND_SPAWNING.load(Ordering::SeqCst) {
            info!("[spawn_backend_with_retry] Spawn in progress, waiting (attempt {})...", attempt);
            for _ in 0..15 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                if !BACKEND_SPAWNING.load(Ordering::SeqCst) {
                    break;
                }
            }
            // After waiting, check if the backend came up
            if is_backend_running().await {
                info!("[spawn_backend_with_retry] Backend came up while waiting — done");
                return;
            }
            continue;
        }

        info!("[spawn_backend_with_retry] Attempt {}/5", attempt);

        if spawn_sidecar(&app).is_ok() {
            // Give the backend time to initialize
            info!("[spawn_backend_with_retry] Waiting 3s for backend to initialize...");
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;

            if is_backend_running().await {
                info!("[spawn_backend_with_retry] Backend is ready!");
                return;
            }
            warn!("[spawn_backend_with_retry] Backend did not respond after attempt {}", attempt);
        } else {
            warn!("[spawn_backend_with_retry] spawn_sidecar returned error on attempt {}", attempt);
        }

        if attempt < 5 {
            info!("[spawn_backend_with_retry] Waiting 2s before retry...");
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }

    error!("[spawn_backend_with_retry] Backend failed to start after 5 attempts");
}

async fn shutdown_backend() {
    info!("[shutdown_backend] Sending POST http://127.0.0.1:8080/api/shutdown ...");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    match client
        .post("http://127.0.0.1:8080/api/shutdown")
        .send()
        .await
    {
        Ok(_) => info!("[shutdown_backend] Shutdown request accepted"),
        Err(e) => warn!("[shutdown_backend] Request failed (backend may already be down): {}", e),
    }

    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
}

async fn do_shutdown() {
    // FIX: Guard against double-shutdown from CloseRequested + RunEvent::Exit
    if SHUTDOWN_CALLED.swap(true, Ordering::SeqCst) {
        info!("[do_shutdown] Already called, skipping duplicate shutdown");
        return;
    }
    info!("[do_shutdown] Initiating graceful shutdown...");
    shutdown_backend().await;
    std::thread::sleep(std::time::Duration::from_millis(500));
    kill_all_backend_processes();
    info!("[do_shutdown] Shutdown complete");
}

#[tauri::command]
async fn ensure_backend_running(app_handle: AppHandle) -> Result<String, String> {
    info!("[ensure_backend_running] Called from frontend");

    if BACKEND_SPAWNING.load(Ordering::SeqCst) {
        info!("[ensure_backend_running] Spawn already in progress");
        return Ok("Backend spawn in progress.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    info!("[ensure_backend_running] Checking http://127.0.0.1:8080/health ...");
    match client.get("http://127.0.0.1:8080/health").send().await {
        Ok(response) if response.status().is_success() => {
            info!("[ensure_backend_running] Backend already running");
            Ok("Backend running.".to_string())
        }
        _ => {
            warn!("[ensure_backend_running] Backend not responding, spawning...");
            match spawn_sidecar(&app_handle) {
                Ok(_) => Ok("Backend started.".to_string()),
                Err(e) => Err(format!("Failed to start backend: {}", e)),
            }
        }
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
                        .level(log::LevelFilter::Debug) // changed to Debug so all [bracket] logs appear
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
                    info!("[setup] Restarted after update — waiting 10s for Windows file lock release...");
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                } else {
                    info!("[setup] Normal startup — killing any leftover backend processes...");
                    kill_all_backend_processes();
                }

                if is_backend_running().await {
                    info!("[setup] Backend already running, skipping spawn");
                    return;
                }

                info!("[setup] Starting backend spawn with retry...");
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
                    info!("[setup] Initial printer scan: {} printers found", list.len());
                    *printers_clone.lock().unwrap() = list;
                }
            });

            if let Some(main_win) = app.get_webview_window("main") {
                info!("[setup] Registering CloseRequested handler on main window");
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
                info!("[run] RunEvent::Exit received — triggering shutdown");
                tauri::async_runtime::block_on(async {
                    do_shutdown().await;
                });
            }
        });
}