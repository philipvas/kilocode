#!/usr/bin/env tsx

import dotenv from "dotenv"
import { readFileSync } from "fs"
import { join } from "path"

// Load environment variables
dotenv.config()

const PORT = process.env.PORT || 3001
const KILOCODE_API_KEY = process.env.KILOCODE_API_KEY

async function testKilocodeAPI() {
	console.log("🔍 Testing Kilocode API Integration\n")
	console.log("=".repeat(50))

	// Check for API key
	if (!KILOCODE_API_KEY) {
		console.error("❌ KILOCODE_API_KEY not found in .env file")
		console.log("\n📝 To fix this:")
		console.log("1. Copy .env.example to .env")
		console.log("2. Add your Kilocode API key from https://kilocode.ai/profile")
		console.log("3. Run this test again\n")
		process.exit(1)
	}

	console.log("✅ Kilocode API key found")

	// Parse the token to show which environment it's for
	try {
		const payloadString = KILOCODE_API_KEY.split(".")[1]
		const payloadJson = Buffer.from(payloadString, "base64").toString()
		const payload = JSON.parse(payloadJson)
		const baseUrl = payload.env === "development" ? "http://localhost:3000" : "https://kilocode.ai"
		console.log(`📍 Using Kilocode API at: ${baseUrl}`)
	} catch (e) {
		console.log("📍 Using Kilocode API at: https://kilocode.ai")
	}

	console.log("\n" + "=".repeat(50))
	console.log("🧪 Testing API endpoints...\n")

	// Test health check
	console.log("1. Testing health check...")
	try {
		const healthResponse = await fetch(`http://localhost:${PORT}/health`)
		const healthData = await healthResponse.json()
		if (healthData.kilocode) {
			console.log("   ✅ Server is healthy and Kilocode is configured")
		} else {
			console.log("   ⚠️  Server is running but Kilocode is not configured")
		}
	} catch (error) {
		console.error("   ❌ Server is not running")
		console.log("   Please start the server with: npm run dev:kilocode")
		process.exit(1)
	}

	// Test chat completion
	console.log("\n2. Testing chat completion...")
	try {
		const chatResponse = await fetch(`http://localhost:${PORT}/v1/messages`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [{ role: "user", content: 'Say "Hello from Kilocode!" and nothing else.' }],
				model: "claude-3-5-haiku-20241022",
				stream: false,
				max_tokens: 50,
			}),
		})

		if (chatResponse.ok) {
			const chatData = await chatResponse.json()
			console.log("   ✅ Chat completion successful")
			console.log(`   Response: ${chatData.content}`)
			if (chatData.usage) {
				console.log(`   Tokens used: ${chatData.usage.total_tokens || "N/A"}`)
			}
		} else {
			const error = await chatResponse.json()
			console.error(`   ❌ Chat completion failed: ${error.error}`)
			if (error.help) {
				console.log(`   💡 ${error.help}`)
			}
		}
	} catch (error: any) {
		console.error(`   ❌ Request failed: ${error.message}`)
	}

	// Test streaming
	console.log("\n3. Testing streaming response...")
	try {
		const streamResponse = await fetch(`http://localhost:${PORT}/v1/messages`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [{ role: "user", content: "Count from 1 to 5." }],
				model: "claude-3-5-haiku-20241022",
				stream: true,
				max_tokens: 50,
			}),
		})

		if (streamResponse.ok) {
			console.log("   ✅ Streaming response received")
			const reader = streamResponse.body?.getReader()
			const decoder = new TextDecoder()
			let buffer = ""
			let chunkCount = 0

			if (reader) {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split("\n")
					buffer = lines.pop() || ""

					for (const line of lines) {
						if (line.startsWith("data: ")) {
							chunkCount++
							if (chunkCount === 1) {
								console.log("   First chunk received successfully")
							}
						}
					}
				}
				console.log(`   Total chunks received: ${chunkCount}`)
			}
		} else {
			const error = await streamResponse.json()
			console.error(`   ❌ Streaming failed: ${error.error}`)
		}
	} catch (error: any) {
		console.error(`   ❌ Streaming request failed: ${error.message}`)
	}

	console.log("\n" + "=".repeat(50))
	console.log("✨ Test complete!\n")
	console.log("Your Kilocode Zed Bridge is ready to use.")
	console.log("You can now use Kilocode in Zed with your API key.\n")
}

// Run the test
testKilocodeAPI().catch(console.error)
