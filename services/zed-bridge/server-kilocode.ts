import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import type { Request, Response } from "express"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Helper function to get Kilocode base URL from token
function getKilocodeBaseUrl(token: string): string {
	try {
		const payloadString = token.split(".")[1]
		const payloadJson = Buffer.from(payloadString, "base64").toString()
		const payload = JSON.parse(payloadJson)
		if (payload.env === "development") {
			return "http://localhost:3000"
		}
	} catch (error) {
		console.warn("Failed to parse Kilocode token, using production URL")
	}
	return "https://kilocode.ai"
}

// Initialize Kilocode client
let kilocodeClient: OpenAI | null = null
const kilocodeApiKey = process.env.KILOCODE_API_KEY

if (kilocodeApiKey) {
	const baseUrl = getKilocodeBaseUrl(kilocodeApiKey)
	kilocodeClient = new OpenAI({
		apiKey: kilocodeApiKey,
		baseURL: `${baseUrl}/api/openrouter`,
		defaultHeaders: {
			"HTTP-Referer": "https://kilocode.ai",
			"X-Title": "Kilo Code Zed Extension",
		},
	})
	console.log(`✓ Using Kilocode API service at ${baseUrl}`)
} else {
	console.warn("⚠️  No KILOCODE_API_KEY found. Please set it in your .env file")
}

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
	res.json({
		status: "ok",
		kilocode: !!kilocodeClient,
		message: kilocodeClient ? "Kilocode API configured" : "Please set KILOCODE_API_KEY",
	})
})

// Main chat endpoint
app.post("/v1/messages", async (req: Request, res: Response) => {
	try {
		const { messages, model = "claude-3-5-sonnet-20241022", stream = false, max_tokens = 4096 } = req.body

		if (!messages || !Array.isArray(messages)) {
			return res.status(400).json({ error: "Messages array is required" })
		}

		if (!kilocodeClient) {
			return res.status(503).json({
				error: "Kilocode API not configured",
				help: "Please set KILOCODE_API_KEY in your .env file",
			})
		}

		// Transform messages to OpenAI format
		const openaiMessages = messages.map((msg: any) => ({
			role: msg.role === "assistant" ? "assistant" : msg.role === "system" ? "system" : "user",
			content: msg.content,
		}))

		// Adjust model name for Kilocode's routing
		const modelName = model.includes("claude") ? `anthropic/${model}` : model

		if (stream) {
			// Handle streaming response
			const streamResponse = await kilocodeClient.chat.completions.create({
				model: modelName,
				messages: openaiMessages,
				stream: true,
				max_tokens,
			})

			res.setHeader("Content-Type", "text/event-stream")
			res.setHeader("Cache-Control", "no-cache")
			res.setHeader("Connection", "keep-alive")

			for await (const chunk of streamResponse) {
				const content = chunk.choices[0]?.delta?.content
				if (content) {
					res.write(`data: ${JSON.stringify({ content })}\n\n`)
				}
			}
			res.write("data: [DONE]\n\n")
			return res.end()
		} else {
			// Handle non-streaming response
			const response = await kilocodeClient.chat.completions.create({
				model: modelName,
				messages: openaiMessages,
				max_tokens,
			})

			return res.json({
				content: response.choices[0]?.message?.content || "",
				model,
				usage: response.usage,
			})
		}
	} catch (error: any) {
		console.error("Kilocode API error:", error)

		// Check for specific error types
		if (error.status === 401) {
			return res.status(401).json({
				error: "Invalid Kilocode API key",
				help: "Please check your KILOCODE_API_KEY in the .env file",
			})
		} else if (error.status === 429) {
			return res.status(429).json({
				error: "Rate limit exceeded",
				help: "Please wait before making more requests",
			})
		} else if (error.status === 402) {
			return res.status(402).json({
				error: "Insufficient credits",
				help: "Please add credits to your Kilocode account at https://kilocode.ai/profile",
			})
		}

		return res.status(500).json({
			error: "Kilocode API request failed",
			details: error.message,
		})
	}
})

// List available models
app.get("/v1/models", async (req: Request, res: Response) => {
	if (!kilocodeClient) {
		return res.status(503).json({
			error: "Kilocode API not configured",
			help: "Please set KILOCODE_API_KEY in your .env file",
		})
	}

	try {
		const models = await kilocodeClient.models.list()
		return res.json(models)
	} catch (error: any) {
		console.error("Failed to fetch models:", error)
		return res.status(500).json({
			error: "Failed to fetch models",
			details: error.message,
		})
	}
})

// Start server
app.listen(PORT, () => {
	console.log(`🚀 Kilocode Zed Bridge running on http://localhost:${PORT}`)
	if (kilocodeClient) {
		console.log("✅ Kilocode API configured - all providers available through unified API")
		console.log("   You can now use any model supported by Kilocode")
	} else {
		console.log("⚠️  No API key configured. Set KILOCODE_API_KEY in your .env file")
		console.log("   Get your API key at: https://kilocode.ai/profile")
	}
	console.log(`📍 Health check: http://localhost:${PORT}/health`)
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
