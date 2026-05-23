import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";
import { AppDataSource } from "../config/database";
import { Message } from "../entities/Message";
import { ConversationParticipant } from "../entities/ConversationParticipant";
import { Notification } from "../entities/Notification";
import { User } from "../entities/User";
import {
  setUserOnline,
  setUserOffline,
  refreshOnlineStatus,
} from "../config/redis";

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
}

let _io: SocketServer | null = null;

export function getIO(): SocketServer {
  if (!_io) throw new Error("Socket.IO has not been initialized yet");
  return _io;
}

export function initSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // ── JWT Auth middleware ──────────────────────────────────────────────────
  io.use((socket: AuthSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) return next(new Error("Authentication required"));

    try {
      const payload = verifyToken(token);
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // ── Connection ───────────────────────────────────────────────────────────
  io.on("connection", async (socket: AuthSocket) => {
    const userId = socket.userId!;
    console.log(`🔌 User connected: ${userId} (${socket.id})`);

    // Mark online
    await setUserOnline(userId);
    await AppDataSource.getRepository(User).update(userId, {
      isOnline: true,
      lastSeen: new Date(),
    });

    // Join all user's conversation rooms
    const participations = await AppDataSource.getRepository(
      ConversationParticipant
    ).find({ where: { userId } });
    participations.forEach((p) => socket.join(`conv:${p.conversationId}`));

    // Join personal room for direct notifications
    socket.join(`user:${userId}`);

    // Broadcast online status to all rooms the user is in
    socket.broadcast.emit("user:online", { userId });

    // ── Heartbeat — keep Redis TTL alive ──────────────────────────────────
    const heartbeat = setInterval(() => refreshOnlineStatus(userId), 60_000);

    // ── Send message ──────────────────────────────────────────────────────
    socket.on(
      "message:send",
      async (data: {
        conversationId: string;
        content?: string;
        type?: string;
        replyToId?: string;
      }) => {
        try {
          const { conversationId, content, type = "text", replyToId } = data;

          const participant = await AppDataSource.getRepository(
            ConversationParticipant
          ).findOne({ where: { conversationId, userId } });

          if (!participant) {
            socket.emit("error", { message: "Not a member of this conversation" });
            return;
          }

          const msgRepo = AppDataSource.getRepository(Message);
          const msg = msgRepo.create({
            conversationId,
            senderId: userId,
            content: content || null,
            type: type as any,
            replyToId: replyToId || null,
            status: "sent",
          });
          await msgRepo.save(msg);

          const full = await msgRepo.findOne({
            where: { id: msg.id },
            relations: ["sender"],
          });

          // Emit to everyone in the conversation room
          io.to(`conv:${conversationId}`).emit("message:new", full);

          // Notify offline participants
          const others = await AppDataSource.getRepository(
            ConversationParticipant
          ).find({ where: { conversationId } });

          const notifRepo = AppDataSource.getRepository(Notification);
          const notifications = others
            .filter((p) => p.userId !== userId)
            .map((p) =>
              notifRepo.create({
                userId: p.userId,
                type: "new_message",
                content: "You have a new message",
                meta: { conversationId, messageId: msg.id, senderId: userId },
              })
            );
          if (notifications.length) {
            await notifRepo.save(notifications);
            // Fetch sender info to enrich the real-time notification
            const sender = await AppDataSource.getRepository(User).findOne({
              where: { id: userId },
              select: ["id", "username", "avatar"],
            });
            notifications.forEach((n) => {
              io.to(`user:${n.userId}`).emit("notification:new", {
                ...n,
                sender: sender ? { id: sender.id, username: sender.username, avatar: sender.avatar } : null,
                conversationName: null,
              });
            });
          }
        } catch (err) {
          console.error("message:send error", err);
          socket.emit("error", { message: "Failed to send message" });
        }
      }
    );

    // ── Typing indicators ─────────────────────────────────────────────────
    socket.on("typing:start", (data: { conversationId: string }) => {
      socket.to(`conv:${data.conversationId}`).emit("typing:start", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("typing:stop", (data: { conversationId: string }) => {
      socket.to(`conv:${data.conversationId}`).emit("typing:stop", {
        userId,
        conversationId: data.conversationId,
      });
    });

    // ── Read receipts ─────────────────────────────────────────────────────
    socket.on(
      "message:read",
      async (data: { messageId: string; conversationId: string }) => {
        try {
          const msgRepo = AppDataSource.getRepository(Message);
          const msg = await msgRepo.findOne({ where: { id: data.messageId } });

          if (msg && msg.senderId !== userId && msg.status !== "read") {
            msg.status = "read";
            await msgRepo.save(msg);

            // Notify the sender
            io.to(`user:${msg.senderId}`).emit("message:read", {
              messageId: msg.id,
              conversationId: data.conversationId,
              readBy: userId,
            });
          }

          // Update participant lastReadAt
          await AppDataSource.getRepository(ConversationParticipant).update(
            { conversationId: data.conversationId, userId },
            { lastReadAt: new Date() }
          );
        } catch (err) {
          console.error("message:read error", err);
        }
      }
    );

    // ── Join a new conversation room (after being added to group) ─────────
    socket.on("conversation:join", (data: { conversationId: string }) => {
      socket.join(`conv:${data.conversationId}`);
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      clearInterval(heartbeat);
      await setUserOffline(userId);
      await AppDataSource.getRepository(User).update(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });
      io.emit("user:offline", { userId, lastSeen: new Date() });
      console.log(`🔌 User disconnected: ${userId}`);
    });
  });

  _io = io;
  return io;
}
