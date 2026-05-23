import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { Notification } from "../entities/Notification";
import { User } from "../entities/User";
import { Conversation } from "../entities/Conversation";
import { sendSuccess, sendError } from "../utils/response";

const notifRepo = () => AppDataSource.getRepository(Notification);

// GET /notifications
export async function getNotifications(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [notifications, total] = await notifRepo().findAndCount({
    where: { userId },
    order: { createdAt: "DESC" },
    skip: (page - 1) * limit,
    take: limit,
  });

  // Enrich notifications with sender and conversation info from meta
  const senderIds = [...new Set(
    notifications
      .map((n) => n.meta?.senderId as string | undefined)
      .filter(Boolean) as string[]
  )];
  const conversationIds = [...new Set(
    notifications
      .map((n) => n.meta?.conversationId as string | undefined)
      .filter(Boolean) as string[]
  )];

  const [senders, conversations] = await Promise.all([
    senderIds.length
      ? AppDataSource.getRepository(User).findByIds(senderIds)
      : Promise.resolve([]),
    conversationIds.length
      ? AppDataSource.getRepository(Conversation).findByIds(conversationIds)
      : Promise.resolve([]),
  ]);

  const senderMap = Object.fromEntries(senders.map((u) => [u.id, u]));
  const convMap = Object.fromEntries(conversations.map((c) => [c.id, c]));

  const enriched = notifications.map((n) => {
    const senderId = n.meta?.senderId as string | undefined;
    const conversationId = n.meta?.conversationId as string | undefined;
    const sender = senderId ? senderMap[senderId] : undefined;
    const conversation = conversationId ? convMap[conversationId] : undefined;

    return {
      ...n,
      sender: sender
        ? { id: sender.id, username: sender.username, avatar: sender.avatar }
        : null,
      conversationName: conversation?.name ?? null,
    };
  });

  sendSuccess(res, {
    notifications: enriched,
    unreadCount: notifications.filter((n) => !n.isRead).length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// PATCH /notifications/:id/read
export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id } = req.params;

  const notif = await notifRepo().findOne({ where: { id, userId } });
  if (!notif) {
    sendError(res, "Notification not found", 404);
    return;
  }

  notif.isRead = true;
  await notifRepo().save(notif);
  sendSuccess(res, null, "Notification marked as read");
}

// PATCH /notifications/read-all
export async function markAllRead(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  await notifRepo().update({ userId, isRead: false }, { isRead: true });
  sendSuccess(res, null, "All notifications marked as read");
}
