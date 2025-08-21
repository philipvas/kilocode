import express from "express"
import cors from "cors"
import { Readable } from "stream"
import path from "path"

// We'll dynamically import providers to handle potential issues
let providers: any = {}

async function loadProviders() {
	try {
		// Try to load providers
		const srcPath = path.resolve(__dirname, "../../src/api/providers")
		console.log("Loading providers from:", srcPath)

		providers.AnthropicHandler = (await import("../../src/api/providers/anthropic")).AnthropicHandler
		providers.OpenAiHandler = (await import("../../src/api/providers/openai")).OpenAiHandler
		providers.OpenAiNativeHandler = (await import("../../src/api/providers/openai-native")).OpenAiNativeHandler
		// Add more providers as needed

		console.log("Loaded providers:", Object.keys(providers))
	} catch (error) {
		console.error("Failed to load some providers:", error)
		// Continue with what we have
	}
}

// VSCode shim for any VSCode-specific APIs used by providers
;(global as any).vscode = {
	window: {
		showErrorMessage: (msg: string) => console.error("[VSCode Shim]", msg),
		showInformationMessage: (msg: string) => console.log("[VSCode Shim]", msg),
		showWarningMessage: (msg: string) => console.warn("[VSCode Shim]", msg),
	},
	workspace: {
		getConfiguration: () => ({
			get: (key: string, defaultValue?: any) => {
				// Map VSCode config to environment variables
				const envKey = key.toUpperCase().replace(/\./g, "_")
				return process.env[envKey] || defaultValue
			},
		}),
	},
	env: {
		openExternal: (uri: any) => console.log("[VSCode Shim] Would open:", uri.toString()),
	},
}

const app = express()
app.use(cors())
app.use(express.json({ limit: "50mb" }))

// Store active handlers
const handlers = new Map<string, ApiHandler>()

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "ok",
		version: "1.0.0",
		providers: Array.from(handlers.keys()),
	})
})

// Initialize provider endpoint
app.post("/provider/init", (req, res) => {
	const { provider, apiKey, apiUrl, modelId } = req.body

	try {
		let handler: any
		const options = { apiKey, apiModelId: modelId, apiUrl }

		// Check if providers are loaded
		if (Object.keys(providers).length === 0) {
			console.log("No providers loaded, using mock handler")
			// Create a mock handler for testing
			handler = {
				provider,
				getModel: () => ({ id: modelId || `${provider}-default`, info: { name: provider } }),
				createMessage: async function* (systemPrompt: string, messages: any[]) {
					const mockResponse = `Mock response from ${provider}. You said: "${messages?.[0]?.content}"`
					for (const char of mockResponse) {
						yield { type: "text", text: char }
					}
				},
				countTokens: async (content: any[]) => content.length * 4, // Mock token count
			}
		} else {
			// Use actual providers
			switch (provider) {
				case "anthropic":
					if (!providers.AnthropicHandler) throw new Error("AnthropicHandler not loaded")
					handler = new providers.AnthropicHandler(options)
					break
				case "openai":
					if (!providers.OpenAiHandler) throw new Error("OpenAiHandler not loaded")
					handler = new providers.OpenAiHandler(options)
					break
				case "openai-native":
					if (!providers.OpenAiNativeHandler) throw new Error("OpenAiNativeHandler not loaded")
					handler = new providers.OpenAiNativeHandler(options)
					break
				default:
					return res.status(400).json({ error: `Provider ${provider} not loaded or unknown` })
			}
		}

		const handlerId = `${provider}-${Date.now()}`
		handlers.set(handlerId, handler)

		res.json({ handlerId, model: handler.getModel() })
	} catch (error: any) {
		res.status(500).json({ error: error.message })
	}
})

// Streaming chat endpoint
app.post("/chat/stream", async (req, res) => {
	const { handlerId, systemPrompt, messages } = req.body

	const handler = handlers.get(handlerId)
	if (!handler) {
		return res.status(404).json({ error: "Handler not found. Call /provider/init first." })
	}

	try {
		// Set up SSE headers
		res.setHeader("Content-Type", "text/event-stream")
		res.setHeader("Cache-Control", "no-cache")
		res.setHeader("Connection", "keep-alive")
		res.setHeader("X-Accel-Buffering", "no") // Disable nginx buffering

		// Convert messages to Anthropic format if needed
		const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map((msg: any) => ({
			role: msg.role,
			content: msg.content,
		}))

		// Create message stream
		const stream = handler.createMessage(systemPrompt || "", anthropicMessages)

		// Forward stream chunks
		for await (const chunk of stream) {
			// Send as SSE
			res.write(`data: ${JSON.stringify(chunk)}\n\n`)

			// Flush to ensure immediate delivery
			if ((res as any).flush) {
				;(res as any).flush()
			}
		}

		// Send completion signal
		res.write("data: [DONE]\n\n")
		res.end()
	} catch (error: any) {
		console.error("Stream error:", error)
		res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
		res.end()
	}
})

// Non-streaming chat endpoint
app.post("/chat", async (req, res) => {
	const { handlerId, systemPrompt, messages } = req.body

	const handler = handlers.get(handlerId)
	if (!handler) {
		return res.status(404).json({ error: "Handler not found. Call /provider/init first." })
	}

	try {
		const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map((msg: any) => ({
			role: msg.role,
			content: msg.content,
		}))

		const stream = handler.createMessage(systemPrompt || "", anthropicMessages)

		// Collect all chunks
		let fullContent = ""
		for await (const chunk of stream) {
			if (chunk.type === "text") {
				fullContent += chunk.text
			}
		}

		res.json({ content: fullContent })
	} catch (error: any) {
		res.status(500).json({ error: error.message })
	}
})

// Cleanup handler endpoint
app.delete("/provider/:handlerId", (req, res) => {
	const { handlerId } = req.params

	if (handlers.delete(handlerId)) {
		res.json({ success: true })
	} else {
		res.status(404).json({ error: "Handler not found" })
	}
})

// Token counting endpoint
app.post("/tokens/count", async (req, res) => {
	const { handlerId, content } = req.body

	const handler = handlers.get(handlerId)
	if (!handler) {
		return res.status(404).json({ error: "Handler not found" })
	}

	try {
		const count = await handler.countTokens(content)
		res.json({ count })
	} catch (error: any) {
		res.status(500).json({ error: error.message })
	}
})

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
	console.log(`🚀 Kilocode Zed Bridge running on port ${PORT}`)
	console.log(`   Health check: http://localhost:${PORT}/health`)
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
