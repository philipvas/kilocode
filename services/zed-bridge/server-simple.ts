import express from "express"
import cors from "cors"

// Simple mock implementation for testing
// In production, this would import the actual providers

const app = express()
app.use(cors())
app.use(express.json({ limit: "50mb" }))

// VSCode shim for any VSCode-specific APIs
;(global as any).vscode = {
	window: {
		showErrorMessage: (msg: string) => console.error("[VSCode Shim]", msg),
		showInformationMessage: (msg: string) => console.log("[VSCode Shim]", msg),
		showWarningMessage: (msg: string) => console.warn("[VSCode Shim]", msg),
	},
	workspace: {
		getConfiguration: () => ({
			get: (key: string, defaultValue?: any) => {
				const envKey = key.toUpperCase().replace(/\./g, "_")
				return process.env[envKey] || defaultValue
			},
		}),
	},
	env: {
		openExternal: (uri: any) => console.log("[VSCode Shim] Would open:", uri.toString()),
	},
}

// Store active handlers
const handlers = new Map<string, any>()

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "ok",
		version: "1.0.0",
		providers: Array.from(handlers.keys()),
		mode: "simple",
	})
})

// Initialize provider endpoint (mock for now)
app.post("/provider/init", (req, res) => {
	const { provider, apiKey, apiUrl, modelId } = req.body

	console.log(`Initializing provider: ${provider}`)

	// For testing, just create a mock handler
	const handlerId = `${provider}-${Date.now()}`
	handlers.set(handlerId, {
		provider,
		apiKey,
		modelId,
	})

	res.json({
		handlerId,
		model: {
			id: modelId || `${provider}-default`,
			info: { name: provider },
		},
	})
})

// Streaming chat endpoint (mock for testing)
app.post("/chat/stream", async (req, res) => {
	const { handlerId, systemPrompt, messages } = req.body

	const handler = handlers.get(handlerId)
	if (!handler) {
		return res.status(404).json({ error: "Handler not found. Call /provider/init first." })
	}

	// Set up SSE headers
	res.setHeader("Content-Type", "text/event-stream")
	res.setHeader("Cache-Control", "no-cache")
	res.setHeader("Connection", "keep-alive")
	res.setHeader("X-Accel-Buffering", "no")

	// Send mock response
	const mockResponse = `This is a test response from the ${handler.provider} provider. You said: "${messages?.[0]?.content}"`

	// Simulate streaming
	for (const char of mockResponse) {
		res.write(`data: ${JSON.stringify({ type: "text", text: char })}\n\n`)
		await new Promise((resolve) => setTimeout(resolve, 10)) // Small delay to simulate streaming
	}

	res.write("data: [DONE]\n\n")
	res.end()
})

// Non-streaming chat endpoint (mock)
app.post("/chat", async (req, res) => {
	const { handlerId, systemPrompt, messages } = req.body

	const handler = handlers.get(handlerId)
	if (!handler) {
		return res.status(404).json({ error: "Handler not found. Call /provider/init first." })
	}

	const mockResponse = `This is a test response from the ${handler.provider} provider. You said: "${messages?.[0]?.content}"`

	res.json({ content: mockResponse })
})

// Test endpoint
app.post("/test", (req, res) => {
	res.json({
		success: true,
		message: "Zed Bridge is working!",
		received: req.body,
	})
})

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
	console.log(`🚀 Kilocode Zed Bridge (Simple Mode) running on port ${PORT}`)
	console.log(`   Health check: http://localhost:${PORT}/health`)
	console.log(`   Test endpoint: POST http://localhost:${PORT}/test`)
	console.log(`   This is a simplified version for testing.`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down gracefully...")
	process.exit(0)
})

process.on("SIGINT", () => {
	console.log("SIGINT received, shutting down gracefully...")
	process.exit(0)
})
