use std::{
    fs::{self, File},
    io::Write,
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use tauri::{Manager, PhysicalPosition, PhysicalSize, Window, WindowEvent, command};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_utils::config::WebviewUrl; // Correct import for WebviewUrl

static IS_CLOSING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn print_document(window: tauri::Window, content: String) -> Result<(), String> {
    // Create hidden window first
    let print_win = tauri::WebviewWindowBuilder::new(
        window.app_handle(),
        "print_window",
        tauri_utils::config::WebviewUrl::External("data:text/html;charset=utf-8,".to_string())
    )
    .title("Print Preview")
    .inner_size(800.0, 600.0)
    .visible(false)
    .build()
    .map_err(|e| format!("create window: {e}"))?;

    // Encode content into a data URL (avoid backticks/escaping issues)
    let encoded = urlencoding::encode(&content);
    let url = format!("data:text/html;charset=utf-8,{}", encoded);

    // Navigate to the data URL (so the doc has a URL & load lifecycle)
    print_win
        .eval(&format!("window.location.replace('{}')", url))
        .map_err(|e| format!("navigate data url: {e}"))?;

    // Attach a load listener that focuses, shows, then prints after paint
    let script = r#"
        (function(){
          function go(){
            window.focus();
            // let layout settle
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.print();
              });
            });
          }
          if (document.readyState === 'complete') go();
          else window.addEventListener('load', go, { once: true });
        })();
    "#;

    print_win.eval(script).map_err(|e| format!("inject print script: {e}"))?;

    // Now show the window so the dialog is allowed to appear
    print_win.show().map_err(|e| format!("show window: {e}"))?;
    print_win.set_focus().ok();

    Ok(())
}

/// Waits for the server to be ready by attempting to connect multiple times.
fn wait_for_server_ready(port: u16, retries: u32, delay_ms: u64, log_path: &PathBuf) -> bool {
    for attempt in 1..=retries {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            write_log(log_path, &format!("Server responded on port {} at attempt {}", port, attempt));
            return true;
        }
        write_log(log_path, &format!("Attempt {}: no response from port {}, retrying...", attempt, port));
        thread::sleep(Duration::from_millis(delay_ms));
    }
    write_log(log_path, &format!("No response from port {} after {} attempts", port, retries));
    false
}

/// Writes a log entry to the specified file and optionally to stdout in debug mode.
fn write_log(path: &PathBuf, content: &str) {
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{}", content);
    }
    if cfg!(debug_assertions) {
        println!("{}", content);
    }
}

/// A wrapper to include context in logging.
fn log_debug(path: &PathBuf, context: &str, message: &str) {
    write_log(path, &format!("[{}] {}", context, message));
}

/// Handles the window close event.
fn handle_close_event(
    window: &Window,
    child_process: Arc<Mutex<Option<Child>>>,
    debug_log: &PathBuf,
) {
    // Show dialog on main thread
    let confirm = window
        .app_handle()
        .dialog()
        .message("Are you sure you want to quit?")
        .title("Confirm Exit")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show();

    if confirm {
        IS_CLOSING.store(true, Ordering::SeqCst);

        // Kill child process if exists
        if let Some(mut child) = child_process.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        // Close the window
        let _ = window.close();
    }
}

/// Main application logic.
pub fn run() {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .expect("Failed to determine executable directory");

    let project_root = exe_dir
        .parent() // Go up from `release` or `debug` to `target`
        .and_then(|p| p.parent()) // Go up from `target` to `src-tauri`
        .and_then(|p| p.parent()) // Go up from `src-tauri` to the project root
        .expect("Failed to determine project root directory")
        .to_path_buf();

    let logs_dir = exe_dir.join("logs");
    fs::create_dir_all(&logs_dir).expect("Failed to create logs directory");

    let stdout_log = logs_dir.join("server_stdout.log");
    let stderr_log = logs_dir.join("server_stderr.log");
    let debug_log = logs_dir.join("debug.log");

    log_debug(&debug_log, "Startup", "Starting Tauri app with Node.js sidecar...");
    log_debug(&debug_log, "Startup", &format!("Executable directory: {:?}", exe_dir));
    log_debug(&debug_log, "Startup", &format!("Project directory: {:?}", project_root));

    let node_exe = exe_dir.join("node").join("node.exe");
    let npm_cli = exe_dir.join("node").join("node_modules").join("npm").join("bin").join("npm-cli.js");

    if !node_exe.exists() {
        panic!("Node executable not found at {:?}", node_exe);
    }
    if !npm_cli.exists() {
        panic!("npm CLI not found at {:?}", npm_cli);
    }

    let child_process: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    let mut cmd = Command::new(&node_exe);
    cmd.arg(&npm_cli)
        .arg("run")
        .arg("start:next")
        .current_dir(&project_root)
        .stdout(Stdio::from(File::create(&stdout_log).unwrap()))
        .stderr(Stdio::from(File::create(&stderr_log).unwrap()));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd.spawn().expect("Failed to spawn Node.js process");
    log_debug(&debug_log, "Startup", &format!("Node.js sidecar started with PID {}", child.id()));
    *child_process.lock().unwrap() = Some(child);

    let port = 3000;
    let child_process_clone = child_process.clone();

    let debug_log_setup = debug_log.clone();
    let debug_log_event = debug_log.clone();

    tauri::Builder::default()
        .setup(move |app| {
            let main_window = app.get_webview_window("main").unwrap();

            // Resize and center the window
            let size = PhysicalSize::new(1200, 800); // set your preferred size
            let _ = main_window.set_size(size);

            if let Some(monitor) = app.primary_monitor().unwrap() {
                let pos = PhysicalPosition::new(
                    (monitor.size().width as i32 - size.width as i32) / 2,
                    (monitor.size().height as i32 - size.height as i32) / 2,
                );
                let _ = main_window.set_position(pos);
            }

            let window_clone = main_window.clone();
            let debug_log_clone = debug_log_setup.clone();

            thread::spawn(move || {
                log_debug(&debug_log_clone, "ServerCheck", "Waiting for server readiness...");
                if wait_for_server_ready(port, 50, 200, &debug_log_clone) {
                    let url = format!("http://localhost:{}", port);
                    log_debug(&debug_log_clone, "ServerCheck", &format!("Server ready. Navigating to {}", url));
                    let _ = window_clone.eval(&format!("window.location.replace('{}')", url));
                    let _ = window_clone.show();
                } else {
                    log_debug(&debug_log_clone, "ServerCheck", "Server failed to start within timeout.");
                    let error_html = "<h1 style='color:red'>Failed to start backend server. Check logs.</h1>";
                    let _ = window_clone.eval(&format!("document.body.innerHTML = `{}`", error_html));
                    let _ = window_clone.show();
                }
            });

            Ok(())
        })
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if IS_CLOSING.load(Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();

                handle_close_event(&window, child_process_clone.clone(), &debug_log_event);
            }
        })
        .invoke_handler(tauri::generate_handler![print_document])
        .run(tauri::generate_context!())
        .expect("Failed to run Tauri application");
}
