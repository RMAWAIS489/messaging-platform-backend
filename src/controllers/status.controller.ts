import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { Status } from "../entities/Status";
import { ConversationParticipant } from "../entities/ConversationParticipant";
import { sendSuccess, sendError } from "../utils/response";
import { MoreThan } from "typeorm";
import { getIO } from "../services/socket.service";

const statusRepo = () => AppDataSource.getRepository(Status);

// 24-hour cutoff
const since24h = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

// Helper: get all userIds that share at least one conversation with the given userId
async function getContactIds(userId: string): Promise<string[]> {
  // Step 1: get all conversationIds this user is part of
  const myParticipations = await AppDataSource.getRepository(ConversationParticipant)
    .find({ where: { userId }, select: ["conversationId"] });

  if (myParticipations.length === 0) return [];

  const myConversationIds = myParticipations.map((p) => p.conversationId);

  // Step 2: get all userIds in those conversations (excluding self)
  const others = await AppDataSource.getRepository(ConversationParticipant)
    .createQueryBuilder("cp")
    .select("DISTINCT cp.userId", "userId")
    .where("cp.conversationId IN (:...ids)", { ids: myConversationIds })
    .andWhere("cp.userId != :userId", { userId })
    .getRawMany();

  return others.map((p: any) => p.userId);
}

// POST /statuses — create a new status
export async function createStatus(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { caption, backgroundColor } = req.body;
  const file = (req as any).file as Express.Multer.File | undefined;

  if (!caption && !file) {
    sendError(res, "Status must have text or an image");
    return;
  }

  const status = statusRepo().create({
    userId,
    caption: caption || null,
    mediaUrl: file ? `/uploads/${file.filename}` : null,
    type: file ? "image" : "text",
    backgroundColor: backgroundColor || null,
  });

  await statusRepo().save(status);

  // Reload with user relation
  const full = await statusRepo().findOne({
    where: { id: status.id },
    relations: ["user"],
  });

  // Broadcast only to users who share a conversation with the poster
  try {
    const io = getIO();
    const contactIds = await getContactIds(userId);
    const targetIds = [userId, ...contactIds];
    targetIds.forEach((id) => {
      io.to(`user:${id}`).emit("status:new", full);
    });
  } catch {
    // socket not ready — ignore
  }

  sendSuccess(res, full, "Status posted", 201);
}

// GET /statuses — get statuses from contacts (people you share a conversation with) + your own
export async function getStatuses(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;

  const contactIds = await getContactIds(userId);

  // Include own statuses
  const allUserIds = [userId, ...contactIds];

  const statuses = await statusRepo().find({
    where: allUserIds.map((id) => ({ userId: id, createdAt: MoreThan(since24h()) })),
    relations: ["user"],
    order: { createdAt: "DESC" },
  });

  // Group by userId
  const grouped: Record<string, { user: any; statuses: Status[] }> = {};
  for (const s of statuses) {
    if (!grouped[s.userId]) {
      const { password, ...safeUser } = s.user as any;
      grouped[s.userId] = { user: safeUser, statuses: [] };
    }
    grouped[s.userId].statuses.push(s);
  }

  // Own statuses first, then contacts sorted by most recent
  const result = Object.values(grouped).sort((a, b) => {
    if (a.user.id === userId) return -1;
    if (b.user.id === userId) return 1;
    const aTime = new Date(a.statuses[0].createdAt).getTime();
    const bTime = new Date(b.statuses[0].createdAt).getTime();
    return bTime - aTime;
  });

  sendSuccess(res, result);
}

// DELETE /statuses/:id
export async function deleteStatus(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id } = req.params;

  const status = await statusRepo().findOne({ where: { id, userId } });
  if (!status) {
    sendError(res, "Status not found", 404);
    return;
  }

  await statusRepo().remove(status);

  try {
    const io = getIO();
    const contactIds = await getContactIds(userId);
    const targetIds = [userId, ...contactIds];
    targetIds.forEach((targetId) => {
      io.to(`user:${targetId}`).emit("status:deleted", { statusId: id, userId });
    });
  } catch {
    // ignore
  }

  sendSuccess(res, null, "Status deleted");
}
