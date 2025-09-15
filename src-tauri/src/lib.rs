use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::Command,
    sync::{atomic::AtomicBool, Arc, Mutex},
    thread,
    time::Duration,
};

use chrono::Local;
use dirs::{data_local_dir, executable_dir};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Builder, Emitter, Manager, WindowEvent};
use which::which;

static IS_CLOSING: AtomicBool = AtomicBool::new(false);

pub struct NodeState {
    pub child: Arc<Mutex<Option<std::process::Child>>>,
}

pub struct AppState {
    pub log_file_path: Arc<Mutex<Option<PathBuf>>>,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
struct AppPaths {
    node_exe: PathBuf,
    npm_cjs: PathBuf,
    package_json: PathBuf,
}

fn get_paths_file() -> PathBuf {
    let base = data_local_dir().expect("Could not determine local data directory");
    let path = base.join("SiriAdminApp").join("paths.json");
    println!("[DEBUG] Paths file location: {}", path.display());
    path
}

fn discover_paths() -> AppPaths {
    println!("[DEBUG] Discovering paths...");
    let node_exe = which("node").unwrap_or_else(|_| {
        println!("[DEBUG] 'node' not found, using fallback 'node.exe'");
        PathBuf::from("node.exe")
    });
    let npm_cjs = which("npm").unwrap_or_else(|_| {
        println!("[DEBUG] 'npm' not found, using fallback 'npm.cjs'");
        PathBuf::from("npm.cjs")
    });
    let pkg = executable_dir().unwrap_or_else(|| {
        println!("[DEBUG] Could not get executable dir, using current dir");
        PathBuf::from(".")
    }).join("package.json");
    let package_json = if pkg.exists() {
        println!("[DEBUG] Found package.json at {}", pkg.display());
        pkg
    } else {
        println!("[DEBUG] package.json not found, using fallback 'package.json'");
        PathBuf::from("package.json")
    };

    AppPaths { node_exe, npm_cjs, package_json }
}

fn load_or_discover_paths() -> AppPaths {
    let paths_file = get_paths_file();
    if let Ok(mut file) = File::open(&paths_file) {
        println!("[DEBUG] Reading paths from {}", paths_file.display());
        let mut content = String::new();
        if file.read_to_string(&mut content).is_ok() {
            if let Ok(paths) = serde_json::from_str::<AppPaths>(&content) {
                println!("[DEBUG] Loaded paths from file");
                if paths.node_exe.exists() && paths.npm_cjs.exists() && paths.package_json.exists() {
                    println!("[DEBUG] All paths exist");
                    return paths;
                } else {
                    println!("[DEBUG] Some paths do not exist, rediscovering...");
                }
            }
        }
    } else {
        println!("[DEBUG] Paths file does not exist, discovering...");
    }
    let paths = discover_paths();
    if let Some(dir) = paths_file.parent() {
        println!("[DEBUG] Creating directory: {}", dir.display());
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(mut file) = File::create(&paths_file) {
        println!("[DEBUG] Saving paths to {}", paths_file.display());
        let _ = file.write_all(serde_json::to_string_pretty(&paths).unwrap().as_bytes());
    }
    paths
}

fn create_log_directory() -> Result<PathBuf, String> {
    println!("[DEBUG] Creating log directory...");
    let base = data_local_dir()
        .ok_or("Could not determine local data directory")?
        .join("SiriAdminApp")
        .join("logs");
    println!("[DEBUG] Log directory path: {}", base.display());
    fs::create_dir_all(&base).map_err(|e| format!("Failed to create log directory: {}", e))?;
    Ok(base)
}

fn write_log(log_file: &Path, msg: &str) {
    println!("[DEBUG] Writing log: {}", msg);
    let entry = format!("{} {}\n", Local::now().format("%Y-%m-%d %H:%M:%S"), msg);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = file.write_all(entry.as_bytes());
        let _ = file.flush();
    }
}

fn log_event(app_handle: &AppHandle, context: &str, message: &str) {
    let log_msg = format!("[{}] {}", context, message);
    println!("[DEBUG] {}", log_msg);
    let _ = app_handle.emit("log-message", json!({
        "context": context,
        "message": message,
        "timestamp": chrono::Utc::now().to_rfc3339()
    }));
    let app_state = app_handle.state::<AppState>();
    let mut lock = app_state.log_file_path.lock().unwrap();
    if let Some(path) = &*lock {
        write_log(path, &log_msg);
    }
}

fn wait_server_ready(port: u16, retries: u32, delay_ms: u64, app_handle: &AppHandle) -> bool {
    println!("[DEBUG] Waiting for server to be ready...");
    for i in 0..retries {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            log_event(app_handle, "ServerCheck", &format!("✅ Server ready on port {}", port));
            return true;
        }
        log_event(app_handle, "ServerCheck", &format!("⏳ Waiting... {}/{}", i + 1, retries));
        thread::sleep(Duration::from_millis(delay_ms));
    }
    log_event(app_handle, "ServerCheck", "❌ Server never ready");
    false
}

fn spawn_node(app_handle: &AppHandle, install_dir: &Path, paths: &AppPaths) -> Result<std::process::Child, String> {
    println!("[DEBUG] Spawning Node.js...");
    let node_exe = &paths.node_exe;
    let app_dir = install_dir.join("_up_");
    println!("[DEBUG] Node executable: {}", node_exe.display());
    println!("[DEBUG] App directory: {}", app_dir.display());
    if !node_exe.exists() {
        return Err("node.exe not found".into());
    }
    if !app_dir.exists() {
        return Err("App directory not found".into());
    }
    let child = Command::new(node_exe)
        .arg("-e")
        .arg(format!(
            r#"
            const express = require('express');
            const path = require('path');
            const fs = require('fs');
            const app = express();
            const port = 3000;
            const appDir = "{}";
            app.use(express.static(appDir));
            app.get('/health',(r,s)=>s.json({{status:'ok'}}));
            app.get('*',(r,s)=>fs.existsSync(path.join(appDir,'index.html'))?
                s.sendFile(path.join(appDir,'index.html')):s.status(404).send('<h1>404</h1>'));
            app.listen(port,'127.0.0.1',()=>console.log('Server up'));
        "#,
            app_dir.display().to_string().replace("\\", "\\\\")
        ))
        .current_dir(install_dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    println!("[DEBUG] Node.js process started with PID {}", child.id());
    Ok(child)
}

pub fn run() {
    let node_state = Arc::new(Mutex::new(None));

    Builder::default()
        .manage(NodeState { child: node_state.clone() })
        .manage(AppState { log_file_path: Arc::new(Mutex::new(None)) })
        .setup({
            let node_state_clone = node_state.clone();
            move |app| {
                let app_handle = app.handle();
                let window = app.get_window("main").unwrap();

                println!("[DEBUG] App setup started...");

                // Discover and persist paths
                let paths = load_or_discover_paths();
                println!("[DEBUG] Discovered AppPaths: {:?}", paths);
                let _ = window.emit("debug-paths", json!({
                    "node_exe": paths.node_exe.display().to_string(),
                    "npm_cjs": paths.npm_cjs.display().to_string(),
                    "package_json": paths.package_json.display().to_string(),
                }));

                // Create log directory and store path
                match create_log_directory() {
                    Ok(dir) => {
                        let log_path = dir.join("siri_admin.log");
                        let app_state = app_handle.state::<AppState>();
                        let mut lock = app_state.log_file_path.lock().unwrap();
                        *lock = Some(log_path.clone());
                        println!("[DEBUG] Logging to {}", log_path.display());
                    }
                    Err(err) => {
                        eprintln!("[DEBUG] Failed to create log directory: {}", err);
                        let _ = window.emit("debug-error", format!("log-dir error: {}", err));
                    }
                }

                // Show loading and spawn server
                println!("[DEBUG] Showing loading message...");
                let _ = window.emit("update-html", "<h1>Starting...</h1>");
                let install_dir = executable_dir().unwrap_or_else(|| {
                    println!("[DEBUG] Could not get executable dir, using current directory");
                    PathBuf::from(".")
                });
                println!("[DEBUG] Install directory: {}", install_dir.display());

                let app_handle_clone = app_handle.clone();
                let window_clone = window.clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(500));
                    match spawn_node(&app_handle_clone, &install_dir, &paths) {
                        Ok(child) => {
                            let pid = child.id();
                            *node_state_clone.lock().unwrap() = Some(child);
                            println!("[DEBUG] Node process started with PID {}", pid);
                        }
                        Err(err) => {
                            eprintln!("[DEBUG] Error spawning Node: {}", err);
                            let _ = app_handle_clone.emit("debug-error", format!("spawn error: {}", err));
                            return;
                        }
                    }
                    if wait_server_ready(3000, 20, 500, &app_handle_clone) {
                        let _ = window_clone.emit("update-html", "<h1>Ready!</h1>");
                    } else {
                        eprintln!("[DEBUG] Server never became ready");
                        let _ = window_clone.emit("update-html", "<h1>Server failed</h1>");
                    }
                });

                println!("[DEBUG] Setup completed.");
                Ok(())
            }
        })
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("app-close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
