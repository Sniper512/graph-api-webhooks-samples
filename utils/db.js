const mongoose = require("mongoose");

let isConnected = false;

/**
 * Connect to MongoDB with retry logic and connection caching
 * Optimized for serverless environments (Vercel)
 */
async function connectDB() {
	// Return existing connection if already connected
	if (isConnected && mongoose.connection.readyState === 1) {
		console.log("✅ Using existing MongoDB connection");
		return;
	}

	try {
		// Set mongoose options for serverless
		mongoose.set("strictQuery", false);

		const db = await mongoose.connect(process.env.DB_URL, {
			serverSelectionTimeoutMS: 30000, // 30s timeout for serverless cold starts
			socketTimeoutMS: 45000,
			maxPoolSize: 10, // Maintain up to 10 connections in the pool
			minPoolSize: 2,
			bufferCommands: false, // Disable buffering to fail fast
		});

		isConnected = db.connection.readyState === 1;
		console.log("✅ Connected to MongoDB");

		// Handle connection events
		mongoose.connection.on("disconnected", () => {
			console.log("❌ MongoDB disconnected");
			isConnected = false;
		});

		mongoose.connection.on("error", (err) => {
			console.error("❌ MongoDB connection error:", err);
			isConnected = false;
		});
	} catch (error) {
		console.error("❌ MongoDB connection failed:", error);
		isConnected = false;
		throw error;
	}
}

/**
 * Middleware to ensure database connection before handling requests
 */
function ensureDBConnection(req, res, next) {
	connectDB()
		.then(() => next())
		.catch((error) => {
			console.error("Database connection error:", error);
			res.status(503).json({
				message: "Database connection unavailable",
				error: error.message,
			});
		});
}

module.exports = { connectDB, ensureDBConnection };
