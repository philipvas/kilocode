# Kilocode Zed Extension

This is the Zed editor extension for Kilocode AI Assistant. It provides AI-powered coding assistance using the same providers as the VSCode extension, without modifying any core Kilocode code.

## Current Status (August 2024)

Due to Zed's limited extension API, the AI functionality is currently accessed through the terminal. Slash commands and rich UI are not yet supported by Zed, but the architecture is ready for when they are!

## Architecture

The extension uses a sidecar architecture:

- **Zed Extension** (Rust): Manages the UI and communicates with the sidecar
- **Sidecar Bridge** (TypeScript): HTTP server that wraps existing Kilocode providers
- **Existing Providers**: All AI provider logic remains unchanged in `src/api/providers/`

## Prerequisites

- [Zed Editor](https://zed.dev/) (latest version)
- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://rustup.rs/) (for building the extension)
- API keys - choose one:
    - **Kilocode API key** (recommended) - Get from https://kilocode.ai/profile
    - **Individual provider keys** - e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`

## Installation

### From Source

1. Clone the repository:

```bash
git clone https://github.com/yourusername/kilocode.git
cd kilocode
```

2. Install dependencies:

```bash
npm install
cd zed-extension
npm install
```

3. Build the extension:

```bash
npm run build
# or
chmod +x build.sh && ./build.sh
```

4. Install in Zed:
    - Open Zed
    - Open Extensions panel (`cmd-shift-x` on macOS)
    - Click "Install Dev Extension"
    - Select the `kilocode/zed-extension` directory

## Configuration

### Setting up API Keys

The bridge server needs API keys to function. You have two options:

#### Option 1: Kilocode API Key (Recommended)

1. Get your API key from https://kilocode.ai/profile
2. Navigate to `services/zed-bridge/`
3. Copy `.env.example` to `.env`
4. Add your Kilocode API key:
    ```env
    KILOCODE_API_KEY=your_kilocode_api_key_here
    ```
5. Start the server: `npm run dev:kilocode`

Benefits:

- Single API key for all providers
- Unified billing through Kilocode
- Access to all Kilocode-supported models
- No need to manage multiple provider keys

#### Option 2: Direct Provider Keys

1. Get API keys from individual providers
2. Navigate to `services/zed-bridge/`
3. Copy `.env.example` to `.env`
4. Add your provider keys:
    ```env
    ANTHROPIC_API_KEY=your_anthropic_key
    OPENAI_API_KEY=your_openai_key
    ```
5. Start the server: `npm run dev`

## Usage

### Current Method: Terminal Commands (Working Now!)

Since Zed doesn't support slash commands yet, use the terminal within Zed (`Cmd+J`):

#### Option 1: Use the Bundled CLI (No Setup Required!)

The extension includes a CLI tool. Just run it directly:

```bash
# From the project root
./zed-extension/bin/kilocode "your question here"

# Or create an alias for easier access
alias kilocode="$PWD/zed-extension/bin/kilocode"

# Then use it anywhere
kilocode "explain async/await in JavaScript"
```

#### Option 2: Direct HTTP Requests

For maximum flexibility, call the API directly:

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"handlerId": "anthropic-1755723020209", "messages": [{"role": "user", "content": "your question"}]}' \
  | jq -r .content
```

#### Usage Examples

```bash
# Ask questions directly
./zed-extension/bin/kilocode "explain async/await in JavaScript"

# Explain selected code
./zed-extension/bin/kilocode "what does this code do: const x = arr.map(n => n * 2)"

# Get help with errors
./zed-extension/bin/kilocode "how to fix: Unterminated regular expression literal"

# Generate code
./zed-extension/bin/kilocode "write a Python function to reverse a string"

# Pipe code to it
cat myfile.js | ./zed-extension/bin/kilocode "explain this code"
```

### Future: Slash Commands (When Zed Supports Them)

Once Zed adds slash command support, you'll be able to use:

```
/kilocode explain this function
```

### Configuration

Set environment variables for API keys:

```bash
export ANTHROPIC_API_KEY="your-key-here"
export OPENAI_API_KEY="your-key-here"
export KILOCODE_PROVIDER="anthropic"  # or "openai", "ollama", etc.
```

### Available Providers

The extension supports all providers from the main Kilocode extension:

- Anthropic (Claude)
- OpenAI (GPT-4, GPT-3.5)
- OpenAI Native (o1, o3)
- Google Gemini
- AWS Bedrock
- Ollama (local models)
- Groq
- DeepSeek
- Mistral
- XAI (Grok)
- OpenRouter
- And many more...

## Development

### Running in Development Mode

1. Start the sidecar in dev mode:

```bash
cd services/zed-bridge
npm run dev
```

2. Build and test the Rust extension:

```bash
cd zed-extension
cargo build
```

3. Install as a dev extension in Zed (see Installation step 4)

### Project Structure

```
kilocode/
├── services/
│   └── zed-bridge/          # Sidecar HTTP server
│       ├── server.ts        # Bridge that imports existing providers
│       └── package.json
├── zed-extension/           # Zed extension
│   ├── src/
│   │   └── lib.rs          # Extension logic & sidecar management
│   ├── Cargo.toml
│   └── extension.toml
└── src/api/providers/       # Existing providers (unchanged)
```

## How It Works

1. When Zed starts, the extension automatically launches the sidecar service
2. The sidecar imports and uses the existing TypeScript providers from `src/api/providers/`
3. The Rust extension communicates with the sidecar via HTTP
4. When Zed closes, the sidecar automatically stops

The sidecar runs on a dynamic port (or 3001 if available) and is completely managed by the extension - no manual setup required!

## Troubleshooting

### Sidecar won't start

- Ensure Node.js is installed: `node --version`
- Check the Zed logs: `~/.config/zed/logs/`

### API errors

- Verify your API keys are set correctly
- Check the provider is supported in `services/zed-bridge/server.ts`

### Build errors

- Update Rust: `rustup update`
- Clear build cache: `npm run clean`

## Contributing

The goal is to maintain compatibility with the main Kilocode codebase:

- Don't modify files in `src/`
- Keep changes isolated to `services/zed-bridge/` and `zed-extension/`
- This allows easy merging of upstream Kilocode updates

## Roadmap

- [x] Basic extension structure
- [x] Sidecar server for AI providers
- [x] Terminal-based usage
- [ ] Slash commands (waiting for Zed API)
- [ ] Rich UI panels (waiting for Zed API)
- [ ] Inline completions (waiting for Zed API)
- [ ] Real AI providers (currently using mock)

## Contributing

This extension will evolve as Zed's API expands. The sidecar architecture ensures we can add features without major refactoring.

## License

Same as the main Kilocode project.
