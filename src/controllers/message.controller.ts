import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { Message } from "../entities/Message";
import { ConversationParticipant } from "../entities/ConversationParticipant";
import { Notification } from "../entities/Notification";
import { sendSuccess, sendError } from "../utils/response";
import { ILike } from "typeorm";
import { getIO } from "../services/socket.service";

const msgRepo = () => AppDataSource.getRepository(Message);
const partRepo = () => AppDataSource.getRepository(ConversationParticipant);
const notifRepo = () => AppDataSource.getRepository(Notification);

// GET /conversations/:id/messages
export async function getMessages(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id: conversationId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const participant = await partRepo().findOne({ where: { conversationId, userId } });
  if (!participant) { sendError(res, "Not a member of this conversation", 403); return; }

  const [messages, total] = await msgRepo().findAndCount({
    where: { conversationId, isDeleted: false },
    relations: ["sender"],
    order: { createdAt: "DESC" },
    skip: (page - 1) * limit,
    take: limit,
  });

  await partRepo().update({ conversationId, userId }, { lastReadAt: new Date() });

  sendSuccess(res, {
    messages: messages.reverse(),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// POST /conversations/:id/messages
export async function sendMessage(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id: conversationId } = req.params;
  const { content, type = "text", replyToId } = req.body;
  const file = (req as any).file as Express.Multer.File | undefined;

  const participant = await partRepo().findOne({ where: { conversationId, userId } });
  if (!participant) { sendError(res, "Not a member of this conversation", 403); return; }

  if (!content && !file) { sendError(res, "Message must have content or a file"); return; }

  const msg = msgRepo().create({
    conversationId,
    senderId: userId,
    content: content || null,
    type: file ? detectFileType(file.mimetype) : type,
    fileUrl: file ? `/uploads/${file.filename}` : null,
    fileName: file ? file.originalname : null,
    fileSize: file ? file.size : null,
    replyToId: replyToId || null,
    status: "sent",
  });

  await msgRepo().save(msg);

  const full = await msgRepo().findOne({
    where: { id: msg.id },
    relations: ["sender"],
  });

  // ── Emit real-time to ALL participants in the conversation room ──────────
  const io = getIO();
  if (io && full) {
    io.to(`conv:${conversationId}`).emit("message:new", full);
  }

  // Create notifications for other participants
  const others = await partRepo().find({ where: { conversationId } });
  const notifications = others
    .filter((p) => p.userId !== userId)
    .map((p) =>
      notifRepo().create({
        userId: p.userId,
        type: "new_message",
        content: `New message in conversation`,
        meta: { conversationId, messageId: msg.id, senderId: userId },
      })
    );
  if (notifications.length) {
    await notifRepo().save(notifications);
    // Emit notifications in real-time, enriched with sender info
    if (io) {
      const senderUser = full?.sender ?? null;
      const senderInfo = senderUser
        ? { id: senderUser.id, username: senderUser.username, avatar: senderUser.avatar }
        : null;
      notifications.forEach((n) => {
        io.to(`user:${n.userId}`).emit("notification:new", {
          ...n,
          sender: senderInfo,
          conversationName: null,
        });
      });
    }
  }

  sendSuccess(res, full, "Message sent", 201);
}

// PATCH /messages/:id — edit message
export async function editMessage(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id } = req.params;
  const { content } = req.body;

  const msg = await msgRepo().findOne({ where: { id } });
  if (!msg) { sendError(res, "Message not found", 404); return; }
  if (msg.senderId !== userId) { sendError(res, "Cannot edit someone else's message", 403); return; }

  msg.content = content;
  await msgRepo().save(msg);

  // Emit edit in real-time
  const io = getIO();
  if (io) io.to(`conv:${msg.conversationId}`).emit("message:updated", msg);

  sendSuccess(res, msg, "Message updated");
}

// DELETE /messages/:id — soft delete
export async function deleteMessage(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id } = req.params;

  const msg = await msgRepo().findOne({ where: { id } });
  if (!msg) { sendError(res, "Message not found", 404); return; }
  if (msg.senderId !== userId) { sendError(res, "Cannot delete someone else's message", 403); return; }

  msg.isDeleted = true;
  msg.content = null;
  await msgRepo().save(msg);

  // Emit delete in real-time
  const io = getIO();
  if (io) io.to(`conv:${msg.conversationId}`).emit("message:deleted", { messageId: id, conversationId: msg.conversationId });

  sendSuccess(res, null, "Message deleted");
}

// PATCH /messages/:id/read
export async function markRead(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id } = req.params;

  const msg = await msgRepo().findOne({ where: { id } });
  if (!msg) { sendError(res, "Message not found", 404); return; }

  const participant = await partRepo().findOne({ where: { conversationId: msg.conversationId, userId } });
  if (!participant) { sendError(res, "Not a member of this conversation", 403); return; }

  if (msg.senderId !== userId && msg.status !== "read") {
    msg.status = "read";
    await msgRepo().save(msg);

    const io = getIO();
    if (io) {
      io.to(`user:${msg.senderId}`).emit("message:read", {
        messageId: msg.id,
        conversationId: msg.conversationId,
        readBy: userId,
      });
    }
  }

  sendSuccess(res, null, "Marked as read");
}

// GET /messages/search
export async function searchMessages(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { q, conversationId } = req.query;

  if (!q) { sendError(res, "Search query required"); return; }

  if (conversationId) {
    const participant = await partRepo().findOne({ where: { conversationId: conversationId as string, userId } });
    if (!participant) { sendError(res, "Not a member of this conversation", 403); return; }
  }

  const whereClause: any = { content: ILike(`%${q}%`), isDeleted: false };
  if (conversationId) whereClause.conversationId = conversationId;

  const messages = await msgRepo().find({
    where: whereClause,
    relations: ["sender"],
    order: { createdAt: "DESC" },
    take: 50,
  });

  sendSuccess(res, messages);
}

function detectFileType(mimetype: string): "image" | "video" | "audio" | "file" {
  const base = mimetype.split(";")[0].trim(); // strip codec params e.g. "audio/webm;codecs=opus"
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "file";
}
