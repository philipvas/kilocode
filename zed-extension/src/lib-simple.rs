use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use zed_extension_api::{self as zed, Result};

struct KilocodeExtension {
    sidecar_process: Arc<Mutex<Option<Child>>>,
    service_port: u16,
}

impl KilocodeExtension {
    fn new() -> Self {
        Self {
            sidecar_process: Arc::new(Mutex::new(None)),
            service_port: 3001,
        }
    }

    fn ensure_sidecar_running(&mut self) -> Result<()> {
        let mut process_guard = self.sidecar_process.lock().unwrap();
        
        // Check if already running
        if process_guard.is_some() {
            return Ok(());
        }

        eprintln!("Starting Kilocode sidecar on port {}...", self.service_port);

        // Try to find Node.js
        let node_cmd = "node";
        
        // For now, just echo a message since we're testing
        // In production, this would start the actual server
        let child = Command::new("echo")
            .arg("Kilocode sidecar would start here")
            .spawn()
            .map_err(|e| format!("Failed to start sidecar: {}", e))?;

        *process_guard = Some(child);
        
        eprintln!("Kilocode sidecar initialized!");
        Ok(())
    }
}

impl zed::Extension for KilocodeExtension {
    fn new() -> Self {
        Self::new()
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Ensure sidecar is running
        let _ = self.ensure_sidecar_running();
        
        // Return a simple echo command for now
        // In production, this would return the actual language server command
        Ok(zed::Command {
            command: "echo".to_string(),
            args: vec!["Kilocode AI Assistant Ready".to_string()],
            env: Default::default(),
        })
    }
}

impl Drop for KilocodeExtension {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.sidecar_process.lock() {
            if let Some(mut process) = guard.take() {
                let _ = process.kill();
                eprintln!("Kilocode sidecar stopped");
            }
        }
    }
}

zed::register_extension!(KilocodeExtension);