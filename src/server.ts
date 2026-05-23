import "reflect-metadata";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import path from "path";

dotenv.config();

import { testConnection } from "./config/database";
import { redis } from "./config/redis";
import { initSocketServer } from "./services/socket.service";

import authRoutes from "./routes/auth.routes";
import conversationRoutes from "./routes/conversation.routes";
import messageRoutes from "./routes/message.routes";
import notificationRoutes from "./routes/notification.routes";
import userRoutes from "./routes/user.routes";
import statusRoutes from "./routes/status.routes";

const app = express();
const httpServer = http.createServer(app);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/statuses", statusRoutes);

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Messaging Platform API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      conversations: "/api/conversations",
      messages: "/api/messages",
      notifications: "/api/notifications",
      users: "/api/users",
    },
  });
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: err.message || "Internal server error" });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  // Connect to PostgreSQL (required)
  await testConnection();

  // Connect to Redis (optional — gracefully degrades to in-memory store)
  try {
    await redis.connect();
  } catch {
    console.log("ℹ️  Redis unavailable — using in-memory store for online status");
  }

  // Initialize Socket.IO
  initSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO ready`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
