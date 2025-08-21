# Kilocode Zed Bridge

This service provides a bridge between the Zed editor and Kilocode's AI providers.

## Setup

### Option 1: Using Kilocode API Key (Recommended)

1. Get your Kilocode API key from https://kilocode.ai/profile
2. Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
3. Add your Kilocode API key to the `.env` file:
    ```
    KILOCODE_API_KEY=your_kilocode_api_key_here
    ```

### Option 2: Using Direct Provider Keys

If you prefer to use direct provider API keys:

1. Copy `.env.example` to `.env`
2. Add your provider keys:
    ```
    ANTHROPIC_API_KEY=your_anthropic_key
    OPENAI_API_KEY=your_openai_key
    ```

## Running the Server

### For Kilocode API (Recommended):

```bash
npm run dev:kilocode
```

### For Direct Providers:

```bash
npm run dev
```

### For Testing with Mock Responses:

```bash
npm run dev:simple
```

## Available Endpoints

- `GET /health` - Health check endpoint
- `POST /v1/messages` - Chat completion endpoint
- `GET /v1/models` - List available models (Kilocode server only)

## Testing

Test the server with curl:

```bash
# Health check
curl http://localhost:3001/health

# Chat completion
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "model": "claude-3-5-sonnet-20241022",
    "stream": false
  }'
```

## Using with Zed

The Zed extension automatically connects to the bridge server on `localhost:3001`. Make sure the server is running before using Kilocode features in Zed.

## Available Servers

1. **server-kilocode.ts** - Uses Kilocode API service (all providers through one API key)
2. **server.ts** - Uses Kilocode's native provider system (requires core imports)
3. **server-simple.ts** - Mock server for testing

## Features

When using the Kilocode API:

- ✅ Access to all Kilocode-supported models
- ✅ Unified billing through Kilocode
- ✅ No need for individual provider API keys
- ✅ Automatic model routing
- ✅ Built-in rate limiting and error handling
