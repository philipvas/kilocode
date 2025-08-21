import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs"
import { join, resolve, relative, dirname, basename, extname } from "path"
import { diffLines } from "diff"
import { createInterface } from "readline"
import type { Request, Response } from "express"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Session storage (in-memory for now, could be persisted)
interface Session {
	id: string
	messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
	currentFile?: string
	projectRoot?: string
	lastModified: Date
}

const sessions = new Map<string, Session>()

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

// Get or create session
function getSession(sessionId?: string): Session {
	if (!sessionId) {
		sessionId = `session-${Date.now()}`
	}

	if (!sessions.has(sessionId)) {
		sessions.set(sessionId, {
			id: sessionId,
			messages: [],
			lastModified: new Date(),
		})
	}

	const session = sessions.get(sessionId)!
	session.lastModified = new Date()
	return session
}

// Clean up old sessions (older than 1 hour)
setInterval(
	() => {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
		for (const [id, session] of sessions) {
			if (session.lastModified < oneHourAgo) {
				sessions.delete(id)
			}
		}
	},
	10 * 60 * 1000,
) // Run every 10 minutes

// Helper to read file content safely
function readFileSafe(filepath: string): string | null {
	try {
		const resolvedPath = resolve(filepath)
		if (existsSync(resolvedPath)) {
			return readFileSync(resolvedPath, "utf-8")
		}
		return null
	} catch (error) {
		console.error(`Error reading file ${filepath}:`, error)
		return null
	}
}

// Helper to write file content safely
function writeFileSafe(filepath: string, content: string): boolean {
	try {
		const resolvedPath = resolve(filepath)
		writeFileSync(resolvedPath, content, "utf-8")
		return true
	} catch (error) {
		console.error(`Error writing file ${filepath}:`, error)
		return false
	}
}

// Helper to analyze project structure
function analyzeProject(rootPath: string, maxDepth: number = 3): any {
	const structure: any = {
		name: basename(rootPath),
		path: rootPath,
		type: "directory",
		children: [],
	}

	function walkDirectory(dirPath: string, depth: number): any[] {
		if (depth > maxDepth) return []

		const items: any[] = []
		try {
			const entries = readdirSync(dirPath)
			for (const entry of entries) {
				// Skip common non-code directories
				if (["node_modules", ".git", "dist", "build", ".next"].includes(entry)) {
					continue
				}

				const fullPath = join(dirPath, entry)
				const stat = statSync(fullPath)

				if (stat.isDirectory()) {
					items.push({
						name: entry,
						path: relative(rootPath, fullPath),
						type: "directory",
						children: walkDirectory(fullPath, depth + 1),
					})
				} else if (stat.isFile()) {
					const ext = extname(entry)
					// Only include code files
					if (
						[
							".js",
							".ts",
							".jsx",
							".tsx",
							".py",
							".go",
							".rs",
							".java",
							".cpp",
							".c",
							".h",
							".css",
							".html",
							".json",
							".md",
						].includes(ext)
					) {
						items.push({
							name: entry,
							path: relative(rootPath, fullPath),
							type: "file",
							extension: ext,
						})
					}
				}
			}
		} catch (error) {
			console.error(`Error walking directory ${dirPath}:`, error)
		}
		return items
	}

	structure.children = walkDirectory(rootPath, 0)
	return structure
}

// Generate diff between original and modified content
function generateDiff(original: string, modified: string, filename: string): string {
	const diff = diffLines(original, modified)
	let output = `--- ${filename} (original)\n+++ ${filename} (modified)\n`

	diff.forEach((part) => {
		const prefix = part.added ? "+" : part.removed ? "-" : " "
		const lines = part.value.split("\n").filter((line) => line !== "")
		lines.forEach((line) => {
			output += `${prefix} ${line}\n`
		})
	})

	return output
}

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
	res.json({
		status: "ok",
		kilocode: !!kilocodeClient,
		features: ["chat", "file-edit", "context", "diff", "project-analysis", "sessions"],
		message: kilocodeClient ? "Enhanced Kilocode server ready" : "Please set KILOCODE_API_KEY",
	})
})

// Get session info
app.get("/session/:sessionId", (req: Request, res: Response) => {
	const session = getSession(req.params.sessionId)
	res.json({
		id: session.id,
		messageCount: session.messages.length,
		currentFile: session.currentFile,
		projectRoot: session.projectRoot,
		lastModified: session.lastModified,
	})
})

// Clear session
app.delete("/session/:sessionId", (req: Request, res: Response) => {
	sessions.delete(req.params.sessionId)
	res.json({ success: true })
})

// Read file endpoint
app.post("/file/read", (req: Request, res: Response) => {
	const { filepath, sessionId } = req.body

	if (!filepath) {
		return res.status(400).json({ error: "filepath is required" })
	}

	const content = readFileSafe(filepath)
	if (content === null) {
		return res.status(404).json({ error: `File not found: ${filepath}` })
	}

	// Update session
	const session = getSession(sessionId)
	session.currentFile = filepath

	res.json({
		filepath,
		content,
		lines: content.split("\n").length,
		sessionId: session.id,
	})
})

// Write file endpoint
app.post("/file/write", (req: Request, res: Response) => {
	const { filepath, content, sessionId } = req.body

	if (!filepath || content === undefined) {
		return res.status(400).json({ error: "filepath and content are required" })
	}

	const success = writeFileSafe(filepath, content)
	if (!success) {
		return res.status(500).json({ error: `Failed to write file: ${filepath}` })
	}

	// Update session
	const session = getSession(sessionId)
	session.currentFile = filepath

	res.json({
		filepath,
		success: true,
		sessionId: session.id,
	})
})

// Generate diff endpoint
app.post("/file/diff", (req: Request, res: Response) => {
	const { filepath, newContent } = req.body

	if (!filepath || !newContent) {
		return res.status(400).json({ error: "filepath and newContent are required" })
	}

	const originalContent = readFileSafe(filepath)
	if (originalContent === null) {
		return res.status(404).json({ error: `File not found: ${filepath}` })
	}

	const diff = generateDiff(originalContent, newContent, basename(filepath))

	res.json({
		filepath,
		diff,
		hasChanges: originalContent !== newContent,
	})
})

// Analyze project endpoint
app.post("/project/analyze", (req: Request, res: Response) => {
	const { rootPath = process.cwd(), sessionId } = req.body

	if (!existsSync(rootPath)) {
		return res.status(404).json({ error: `Directory not found: ${rootPath}` })
	}

	const structure = analyzeProject(rootPath)

	// Update session
	const session = getSession(sessionId)
	session.projectRoot = rootPath

	// Count files and directories
	let fileCount = 0
	let dirCount = 0

	function countItems(node: any) {
		if (node.type === "file") {
			fileCount++
		} else if (node.type === "directory") {
			dirCount++
			if (node.children) {
				node.children.forEach(countItems)
			}
		}
	}

	countItems(structure)

	res.json({
		rootPath,
		structure,
		stats: {
			files: fileCount,
			directories: dirCount,
		},
		sessionId: session.id,
	})
})

// Enhanced chat endpoint with context
app.post("/chat/enhanced", async (req: Request, res: Response) => {
	try {
		const {
			message,
			sessionId,
			includeFile,
			filepath,
			operation,
			model = "claude-3-5-haiku-20241022",
			stream = false,
		} = req.body

		if (!message) {
			return res.status(400).json({ error: "message is required" })
		}

		if (!kilocodeClient) {
			return res.status(503).json({
				error: "Kilocode API not configured",
				help: "Please set KILOCODE_API_KEY in your .env file",
			})
		}

		const session = getSession(sessionId)

		// Build context
		let context = ""

		// Add file context if requested
		if (includeFile && filepath) {
			const fileContent = readFileSafe(filepath)
			if (fileContent) {
				context += `\nFile: ${filepath}\n\`\`\`\n${fileContent}\n\`\`\`\n\n`
				session.currentFile = filepath
			}
		}

		// Add project context if available
		if (session.projectRoot) {
			context += `\nProject root: ${session.projectRoot}\n`
		}

		// Build messages array with context
		const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = []

		// Add conversation history (keep last 10 messages for context)
		const historyMessages = session.messages.slice(-10)
		messages.push(...historyMessages)

		// Add current message with context
		const fullMessage = context ? `${context}\n${message}` : message
		messages.push({ role: "user" as const, content: fullMessage })

		// Handle special operations
		if (operation === "edit" && filepath) {
			messages.push({
				role: "system" as const,
				content: "You are helping to edit code. Provide the complete modified file content in your response.",
			})
		} else if (operation === "explain") {
			messages.push({
				role: "system" as const,
				content: "Explain the code clearly and concisely.",
			})
		} else if (operation === "refactor") {
			messages.push({
				role: "system" as const,
				content: "Suggest refactoring improvements for the code. Provide the complete refactored code.",
			})
		}

		// Adjust model name for Kilocode's routing
		const modelName = model.includes("claude") ? `anthropic/${model}` : model

		// Make API call
		const response = await kilocodeClient.chat.completions.create({
			model: modelName,
			messages: messages as any,
			max_tokens: 4096,
			stream: false,
		})

		const assistantMessage = response.choices[0]?.message?.content || ""

		// Update session history
		session.messages.push(
			{ role: "user" as const, content: message },
			{ role: "assistant" as const, content: assistantMessage },
		)

		// Keep session size manageable
		if (session.messages.length > 50) {
			session.messages = session.messages.slice(-30)
		}

		res.json({
			content: assistantMessage,
			sessionId: session.id,
			model,
			usage: response.usage,
			context: {
				hasFile: !!filepath,
				hasProject: !!session.projectRoot,
				messageCount: session.messages.length,
			},
		})
	} catch (error: any) {
		console.error("Enhanced chat error:", error)
		res.status(500).json({
			error: "Request failed",
			details: error.message,
		})
	}
})

// Apply edit endpoint - combines chat with file editing
app.post("/edit/apply", async (req: Request, res: Response) => {
	try {
		const { filepath, instruction, sessionId, createBackup = true } = req.body

		if (!filepath || !instruction) {
			return res.status(400).json({ error: "filepath and instruction are required" })
		}

		if (!kilocodeClient) {
			return res.status(503).json({
				error: "Kilocode API not configured",
				help: "Please set KILOCODE_API_KEY in your .env file",
			})
		}

		// Read current file content
		const originalContent = readFileSafe(filepath)
		if (originalContent === null) {
			return res.status(404).json({ error: `File not found: ${filepath}` })
		}

		// Create backup if requested
		if (createBackup) {
			const backupPath = `${filepath}.backup.${Date.now()}`
			writeFileSafe(backupPath, originalContent)
		}

		// Get AI to edit the file
		const messages = [
			{
				role: "system" as const,
				content:
					"You are a code editor. Modify the provided code according to the instruction. Return ONLY the complete modified code, no explanations.",
			},
			{
				role: "user" as const,
				content: `File: ${filepath}\n\n\`\`\`\n${originalContent}\n\`\`\`\n\nInstruction: ${instruction}\n\nProvide the complete modified file content:`,
			},
		]

		const response = await kilocodeClient.chat.completions.create({
			model: "anthropic/claude-3-5-sonnet-20241022", // Use a better model for edits
			messages: messages as any,
			max_tokens: 8192,
		})

		const modifiedContent = response.choices[0]?.message?.content || ""

		// Extract code from response (remove markdown if present)
		let cleanContent = modifiedContent
		const codeBlockMatch = modifiedContent.match(/```[\w]*\n([\s\S]*?)\n```/)
		if (codeBlockMatch) {
			cleanContent = codeBlockMatch[1]
		}

		// Generate diff
		const diff = generateDiff(originalContent, cleanContent, basename(filepath))

		// Update session
		const session = getSession(sessionId)
		session.currentFile = filepath
		session.messages.push(
			{ role: "user" as const, content: `Edit ${filepath}: ${instruction}` },
			{ role: "assistant" as const, content: `Applied edit to ${filepath}` },
		)

		res.json({
			filepath,
			diff,
			originalContent,
			modifiedContent: cleanContent,
			sessionId: session.id,
			usage: response.usage,
		})
	} catch (error: any) {
		console.error("Edit apply error:", error)
		res.status(500).json({
			error: "Edit failed",
			details: error.message,
		})
	}
})

// Confirm and save edit
app.post("/edit/save", (req: Request, res: Response) => {
	const { filepath, content, sessionId } = req.body

	if (!filepath || content === undefined) {
		return res.status(400).json({ error: "filepath and content are required" })
	}

	const success = writeFileSafe(filepath, content)
	if (!success) {
		return res.status(500).json({ error: `Failed to save file: ${filepath}` })
	}

	// Update session
	const session = getSession(sessionId)
	session.messages.push({
		role: "system" as const,
		content: `Saved changes to ${filepath}`,
	})

	res.json({
		filepath,
		success: true,
		sessionId: session.id,
	})
})

// Original simple chat endpoint (for backward compatibility)
app.post("/v1/messages", async (req: Request, res: Response) => {
	try {
		const { messages, model = "claude-3-5-haiku-20241022", stream = false, max_tokens = 4096 } = req.body

		if (!messages || !Array.isArray(messages)) {
			return res.status(400).json({ error: "Messages array is required" })
		}

		if (!kilocodeClient) {
			return res.status(503).json({
				error: "Kilocode API not configured",
				help: "Please set KILOCODE_API_KEY in your .env file",
			})
		}

		// Transform messages to OpenAI format with proper typing
		const openaiMessages = messages.map((msg: any) => ({
			role:
				msg.role === "assistant"
					? ("assistant" as const)
					: msg.role === "system"
						? ("system" as const)
						: ("user" as const),
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

// Start server
app.listen(PORT, () => {
	console.log(`🚀 Enhanced Kilocode Zed Bridge running on http://localhost:${PORT}`)
	console.log("\n📦 Features:")
	console.log("  ✅ Chat with AI (with context)")
	console.log("  ✅ File reading and editing")
	console.log("  ✅ Diff generation")
	console.log("  ✅ Project analysis")
	console.log("  ✅ Session management")
	console.log("  ✅ Conversation history")

	if (kilocodeClient) {
		console.log("\n✅ Kilocode API configured - all providers available")
	} else {
		console.log("\n⚠️  No API key configured. Set KILOCODE_API_KEY in your .env file")
		console.log("   Get your API key at: https://kilocode.ai/profile")
	}
	console.log(`\n📍 Health check: http://localhost:${PORT}/health`)
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
