use std::os::windows::process::CommandExt;
use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
use std::process::{Command, Stdio};
use std::fs::{self, File};
use std::env;
use std::path::PathBuf;

pub fn run() {
    // Get the directory where the executable is located
    let exe_dir: PathBuf = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| env::current_dir().unwrap());

    let logs_dir = exe_dir.join("logs");
    let up_dir = exe_dir.join("_up_");

    // Create logs directory if it doesn't exist
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir).expect("Failed to create logs directory");
    }

    // Create the log files
    let stdout_log = File::create(logs_dir.join("server.log"))
        .expect("Failed to create server.log file");
    let stderr_log = File::create(logs_dir.join("server-error.log"))
        .expect("Failed to create server-error.log file");

    // Verify that node and npm-cli.js exist
    assert!(
        exe_dir.join("node/node.exe").exists(),
        "node.exe not found in node folder"
    );
    assert!(
        exe_dir
            .join("node/node_modules/npm/bin/npm-cli.js")
            .exists(),
        "npm-cli.js not found in node_modules"
    );
    assert!(
        up_dir.exists(),
        "_up_ directory not found where server files are located"
    );

    // Start the Node server using the bundled node.exe and npm-cli.js
    let _child = Command::new(exe_dir.join("node/node.exe"))
        .arg(exe_dir.join("node/node_modules/npm/bin/npm-cli.js"))
        .arg("run")
        .arg("start")
        .current_dir(&up_dir) // working directory is _up_
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log))
        .creation_flags(0x08000000) // Hide terminal window for child process
        .spawn()
        .expect("Failed to start Node server");

    // Set up the Tauri application
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Load the local development server in the main window
            let main_window = app.get_webview_window("main").unwrap();
            main_window
                .eval("window.location.replace('http://localhost:3000')")
                .unwrap();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
