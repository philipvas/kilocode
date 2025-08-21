use zed_extension_api::{self as zed, Result};

struct KilocodeExtension;

impl KilocodeExtension {
    fn new() -> Self {
        Self
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
        // Return a simple echo command that shows the extension is loaded
        // The actual AI functionality is provided by the sidecar at http://localhost:3001
        Ok(zed::Command {
            command: "echo".to_string(),
            args: vec![
                "Kilocode AI Extension Loaded - Sidecar at http://localhost:3001".to_string()
            ],
            env: Default::default(),
        })
    }
}

zed::register_extension!(KilocodeExtension);