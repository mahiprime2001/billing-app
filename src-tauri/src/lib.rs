use std::env;
use std::fs::{self, File};
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{sleep, spawn};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::{Manager, WindowEvent, PhysicalSize};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use log::LevelFilter;

// Flag to prevent multiple close attempts
static IS_CLOSING: AtomicBool = AtomicBool::new(false);

// Constants for Windows process creation flags
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Helper to get timestamp
fn get_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

// Find the first available port starting from base_port
fn find_available_port(base_port: u16, logs_dir: &PathBuf) -> u16 {
    let debug_log = logs_dir.join("debug.log");
    write_log(&debug_log, &format!("[{}] Starting port search from {}", get_timestamp(), base_port));
    
    for port in base_port..base_port + 100 {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(_) => {
                write_log(&debug_log, &format!("[{}] Found available port: {}", get_timestamp(), port));
                return port;
            }
            Err(e) => {
                write_log(&debug_log, &format!("[{}] Port {} unavailable: {}", get_timestamp(), port, e));
            }
        }
    }
    
    let error_msg = format!("No available ports found in range {}-{}", base_port, base_port + 100);
    write_log(&debug_log, &format!("[{}] CRITICAL: {}", get_timestamp(), error_msg));
    panic!("{}", error_msg);
}

// Wait for the server to start and listen on the port
fn wait_for_server(port: u16, retries: u32, delay_ms: u64, logs_dir: &PathBuf) -> bool {
    let debug_log = logs_dir.join("debug.log");
    write_log(&debug_log, &format!("[{}] Starting server wait check on port {} (retries: {}, delay: {}ms)", 
        get_timestamp(), port, retries, delay_ms));
    
    for attempt in 0..retries {
        match std::net::TcpStream::connect(("127.0.0.1", port)) {
            Ok(_) => {
                write_log(&debug_log, &format!("[{}] Server connection successful on attempt {}", get_timestamp(), attempt + 1));
                return true;
            }
            Err(e) => {
                write_log(&debug_log, &format!("[{}] Attempt {}/{} failed: {}", get_timestamp(), attempt + 1, retries, e));
                sleep(Duration::from_millis(delay_ms));
            }
        }
    }
    
    write_log(&debug_log, &format!("[{}] Server connection failed after {} attempts", get_timestamp(), retries));
    false
}

// Helper to safely write logs
fn write_log(file_path: &PathBuf, content: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let formatted_content = format!("[{}] {}", timestamp, content);
    
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_path)
        .and_then(|mut f| writeln!(f, "{}", formatted_content));
        
    // Also print to console in debug mode
    if cfg!(debug_assertions) {
        println!("{}", formatted_content);
    }
}

// Validate required files and directories
fn validate_environment(exe_dir: &PathBuf, up_dir: &PathBuf, logs_dir: &PathBuf) -> Result<(), String> {
    let debug_log = logs_dir.join("debug.log");
    
    write_log(&debug_log, &format!("[{}] Starting environment validation", get_timestamp()));
    write_log(&debug_log, &format!("[{}] Executable directory: {:?}", get_timestamp(), exe_dir));
    write_log(&debug_log, &format!("[{}] Next.js project directory: {:?}", get_timestamp(), up_dir));
    
    let node_exe = exe_dir.join("node/node.exe");
    let npm_cli = exe_dir.join("node/node_modules/npm/lib/cli.js");
    
    // Check Node.js executable
    if !node_exe.exists() {
        let error = format!("Node.js executable not found at: {:?}", node_exe);
        write_log(&debug_log, &format!("[{}] ERROR: {}", get_timestamp(), error));
        return Err(error);
    }
    write_log(&debug_log, &format!("[{}] ✓ Node.js executable found", get_timestamp()));
    
    // Check npm CLI
    if !npm_cli.exists() {
        let error = format!("npm CLI not found at: {:?}", npm_cli);
        write_log(&debug_log, &format!("[{}] ERROR: {}", get_timestamp(), error));
        return Err(error);
    }
    write_log(&debug_log, &format!("[{}] ✓ npm CLI found", get_timestamp()));
    
    // Check Next.js project directory
    if !up_dir.exists() {
        let error = format!("Next.js project directory not found at: {:?}", up_dir);
        write_log(&debug_log, &format!("[{}] ERROR: {}", get_timestamp(), error));
        return Err(error);
    }
    write_log(&debug_log, &format!("[{}] ✓ Next.js project directory found", get_timestamp()));
    
    // Check package.json
    let package_json = up_dir.join("package.json");
    if !package_json.exists() {
        let error = format!("package.json not found at: {:?}", package_json);
        write_log(&debug_log, &format!("[{}] ERROR: {}", get_timestamp(), error));
        return Err(error);
    }
    write_log(&debug_log, &format!("[{}] ✓ package.json found", get_timestamp()));
    
    // Check node_modules
    let node_modules = up_dir.join("node_modules");
    if !node_modules.exists() {
        let warning = format!("node_modules not found at: {:?} - may need npm install", node_modules);
        write_log(&debug_log, &format!("[{}] WARNING: {}", get_timestamp(), warning));
    } else {
        write_log(&debug_log, &format!("[{}] ✓ node_modules found", get_timestamp()));
    }
    
    write_log(&debug_log, &format!("[{}] Environment validation completed successfully", get_timestamp()));
    Ok(())
}

// Main run function
pub fn run() {
    // Initialize logging
    env_logger::Builder::from_default_env()
        .filter_level(LevelFilter::Debug)
        .init();
    
    let exe_dir: PathBuf = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| env::current_dir().unwrap());

    let up_dir = exe_dir.join("_up_"); // Next.js project folder
    let logs_dir = exe_dir.join("logs");

    // Create logs directory
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir).expect("Failed to create logs directory");
    }

    let stdout_log = logs_dir.join("server.log");
    let stderr_log = logs_dir.join("server-error.log");
    let debug_log = logs_dir.join("debug.log");

    // Clear previous logs
    let _ = fs::remove_file(&stdout_log);
    let _ = fs::remove_file(&stderr_log);
    let _ = fs::remove_file(&debug_log);

    write_log(&debug_log, &format!("[{}] ========== TAURI APP STARTUP ==========", get_timestamp()));
    write_log(&debug_log, &format!("[{}] Debug mode: {}", get_timestamp(), cfg!(debug_assertions)));

    // Validate environment
    if let Err(error) = validate_environment(&exe_dir, &up_dir, &logs_dir) {
        write_log(&debug_log, &format!("[{}] FATAL: Environment validation failed: {}", get_timestamp(), error));
        panic!("Environment validation failed: {}", error);
    }

    let is_dev = cfg!(debug_assertions);
    let port = find_available_port(3000, &logs_dir);

    let child_process = Arc::new(Mutex::new(None));
    let npm_cli = exe_dir.join("node/node_modules/npm/lib/cli.js");
    let node_exe = exe_dir.join("node/node.exe");

    write_log(&debug_log, &format!("[{}] Preparing to start Node.js server", get_timestamp()));
    write_log(&debug_log, &format!("[{}] Node executable: {:?}", get_timestamp(), node_exe));
    write_log(&debug_log, &format!("[{}] npm CLI: {:?}", get_timestamp(), npm_cli));
    write_log(&debug_log, &format!("[{}] Working directory: {:?}", get_timestamp(), up_dir));
    write_log(&debug_log, &format!("[{}] Port: {}", get_timestamp(), port));
    write_log(&debug_log, &format!("[{}] Environment: {}", get_timestamp(), if is_dev { "development" } else { "production" }));

    // Build command to run the server
    let mut command = Command::new(&node_exe);
    command
        .arg(&npm_cli)
        .arg("run")
        .arg("start")
        .current_dir(&up_dir)
        .env("PORT", port.to_string())
        .env("NODE_ENV", if is_dev { "development" } else { "production" });

    // Set up stdio
    match File::create(&stdout_log) {
        Ok(stdout_file) => {
            command.stdout(Stdio::from(stdout_file));
            write_log(&debug_log, &format!("[{}] ✓ stdout redirect configured", get_timestamp()));
        }
        Err(e) => {
            write_log(&debug_log, &format!("[{}] ERROR: Failed to create stdout log: {}", get_timestamp(), e));
        }
    }

    match File::create(&stderr_log) {
        Ok(stderr_file) => {
            command.stderr(Stdio::from(stderr_file));
            write_log(&debug_log, &format!("[{}] ✓ stderr redirect configured", get_timestamp()));
        }
        Err(e) => {
            write_log(&debug_log, &format!("[{}] ERROR: Failed to create stderr log: {}", get_timestamp(), e));
        }
    }

    // Windows-specific configuration to hide console window
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
        write_log(&debug_log, &format!("[{}] ✓ Windows CREATE_NO_WINDOW flag set", get_timestamp()));
    }

    write_log(&debug_log, &format!("[{}] Spawning Node.js process...", get_timestamp()));

    // Spawn the process
    match command.spawn() {
        Ok(child) => {
            let child_id = child.id();
            write_log(&debug_log, &format!("[{}] ✓ Node.js process spawned successfully (PID: {})", get_timestamp(), child_id));
            *child_process.lock().unwrap() = Some(child);
        }
        Err(e) => {
            let error_msg = format!("Failed to spawn Node.js process: {}", e);
            write_log(&debug_log, &format!("[{}] CRITICAL ERROR: {}", get_timestamp(), error_msg));
            panic!("{}", error_msg);
        }
    }

    let child_process_clone = Arc::clone(&child_process);
    let main_window_port = port;
    let logs_dir_clone = logs_dir.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let main_window = app.get_webview_window("main").unwrap();
            let debug_log = logs_dir_clone.join("debug.log");

            write_log(&debug_log, &format!("[{}] Tauri app setup started", get_timestamp()));

            // Resize main window to monitor size
            if let Some(monitor) = app.primary_monitor().unwrap_or(None) {
                let size = monitor.size();
                match main_window.set_size(PhysicalSize::new(size.width, size.height)) {
                    Ok(_) => write_log(&debug_log, &format!("[{}] ✓ Window resized to {}x{}", get_timestamp(), size.width, size.height)),
                    Err(e) => write_log(&debug_log, &format!("[{}] WARNING: Failed to resize window: {}", get_timestamp(), e)),
                }
            }

            let main_window_clone = main_window.clone();
            let logs_dir_clone2 = logs_dir_clone.clone();

            // Wait for server to be ready
            spawn(move || {
                let debug_log = logs_dir_clone2.join("debug.log");
                write_log(&debug_log, &format!("[{}] Starting server readiness check", get_timestamp()));

                if wait_for_server(main_window_port, 50, 200, &logs_dir_clone2) {
                    let url = format!("http://localhost:{}", main_window_port);
                    write_log(&debug_log, &format!("[{}] ✓ Server is ready, loading URL: {}", get_timestamp(), url));
                    
                    match main_window_clone.eval(&format!("window.location.replace('{}')", url)) {
                        Ok(_) => write_log(&debug_log, &format!("[{}] ✓ URL navigation command sent", get_timestamp())),
                        Err(e) => write_log(&debug_log, &format!("[{}] ERROR: Failed to send navigation command: {}", get_timestamp(), e)),
                    }
                    
                    match main_window_clone.show() {
                        Ok(_) => write_log(&debug_log, &format!("[{}] ✓ Window shown successfully", get_timestamp())),
                        Err(e) => write_log(&debug_log, &format!("[{}] ERROR: Failed to show window: {}", get_timestamp(), e)),
                    }
                } else {
                    let msg = format!("Server at port {} did not respond after multiple attempts", main_window_port);
                    write_log(&debug_log, &format!("[{}] CRITICAL: {}", get_timestamp(), msg));
                    
                    // Try to read server logs for debugging
                    let stdout_log = logs_dir_clone2.join("server.log");
                    let stderr_log = logs_dir_clone2.join("server-error.log");
                    
                    if let Ok(stdout_content) = fs::read_to_string(&stdout_log) {
                        write_log(&debug_log, &format!("[{}] Server stdout: {}", get_timestamp(), stdout_content));
                    }
                    
                    if let Ok(stderr_content) = fs::read_to_string(&stderr_log) {
                        write_log(&debug_log, &format!("[{}] Server stderr: {}", get_timestamp(), stderr_content));
                    }
                    
                    let error_html = format!(
                        "<div style='padding: 20px; font-family: Arial, sans-serif;'>
                            <h2 style='color: red;'>Server Connection Failed</h2>
                            <p>{}</p>
                            <p>Please check the logs directory for more details:</p>
                            <ul>
                                <li>debug.log - Application flow</li>
                                <li>server.log - Server output</li>
                                <li>server-error.log - Server errors</li>
                            </ul>
                        </div>", 
                        msg
                    );
                    
                    match main_window_clone.eval(&format!("document.body.innerHTML = `{}`", error_html)) {
                        Ok(_) => write_log(&debug_log, &format!("[{}] Error message displayed to user", get_timestamp())),
                        Err(e) => write_log(&debug_log, &format!("[{}] ERROR: Failed to display error message: {}", get_timestamp(), e)),
                    }
                    
                    match main_window_clone.show() {
                        Ok(_) => write_log(&debug_log, &format!("[{}] Window shown with error message", get_timestamp())),
                        Err(e) => write_log(&debug_log, &format!("[{}] ERROR: Failed to show window with error: {}", get_timestamp(), e)),
                    }
                }
            });

            write_log(&debug_log, &format!("[{}] Tauri app setup completed", get_timestamp()));
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if IS_CLOSING.load(Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();

                let app_handle = window.app_handle().clone();
                let child_process = Arc::clone(&child_process_clone);

                spawn(move || {
                    let confirmed = app_handle
                        .dialog()
                        .message("Are you sure you want to close the application?")
                        .title("Confirm Close")
                        .buttons(MessageDialogButtons::OkCancel)
                        .blocking_show();

                    if confirmed {
                        IS_CLOSING.store(true, Ordering::SeqCst);

                        // Kill the Node.js process
                        if let Some(mut child) = child_process.lock().unwrap().take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }

                        let ah_clone = app_handle.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            if let Some(win) = ah_clone.get_webview_window("main") {
                                let _ = win.close();
                            }
                        });
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
