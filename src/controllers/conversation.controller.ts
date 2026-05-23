import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { Conversation } from "../entities/Conversation";
import { ConversationParticipant } from "../entities/ConversationParticipant";
import { User } from "../entities/User";
import { sendSuccess, sendError } from "../utils/response";
import { isUserOnline } from "../config/redis";

const convRepo = () => AppDataSource.getRepository(Conversation);
const partRepo = () => AppDataSource.getRepository(ConversationParticipant);
const userRepo = () => AppDataSource.getRepository(User);

// GET /conversations — list all conversations for current user
export async function getConversations(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;

  const participations = await partRepo().find({
    where: { userId },
    relations: ["conversation", "conversation.participants", "conversation.participants.user"],
  });

  const conversations = await Promise.all(
    participations.map(async (p) => {
      const conv = p.conversation;
      const participants = conv.participants.map((cp) => ({
        id: cp.user.id,
        username: cp.user.username,
        avatar: cp.user.avatar,
        role: cp.role,
        lastReadAt: cp.lastReadAt,
      }));

      // For direct chats, get the other user's online status
      let otherUserOnline = false;
      if (conv.type === "direct") {
        const other = conv.participants.find((cp) => cp.userId !== userId);
        if (other) otherUserOnline = await isUserOnline(other.userId);
      }

      return { ...conv, participants, otherUserOnline };
    })
  );

  sendSuccess(res, conversations);
}

// POST /conversations/direct — start or get a direct conversation
export async function createDirectConversation(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { targetUserId } = req.body;

  if (userId === targetUserId) {
    sendError(res, "Cannot create conversation with yourself");
    return;
  }

  const target = await userRepo().findOne({ where: { id: targetUserId } });
  if (!target) {
    sendError(res, "Target user not found", 404);
    return;
  }

  // Check if direct conversation already exists between these two users
  const existing = await AppDataSource.query(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants cp1 ON cp1."conversationId" = c.id AND cp1."userId" = $1
     JOIN conversation_participants cp2 ON cp2."conversationId" = c.id AND cp2."userId" = $2
     WHERE c.type = 'direct'
     LIMIT 1`,
    [userId, targetUserId]
  );

  if (existing.length > 0) {
    const conv = await convRepo().findOne({
      where: { id: existing[0].id },
      relations: ["participants", "participants.user"],
    });
    sendSuccess(res, conv);
    return;
  }

  const conv = convRepo().create({ type: "direct" });
  await convRepo().save(conv);

  await partRepo().save([
    partRepo().create({ userId, conversationId: conv.id, role: "member" }),
    partRepo().create({ userId: targetUserId, conversationId: conv.id, role: "member" }),
  ]);

  const full = await convRepo().findOne({
    where: { id: conv.id },
    relations: ["participants", "participants.user"],
  });
  sendSuccess(res, full, "Conversation created", 201);
}

// POST /conversations/group — create a group conversation
export async function createGroupConversation(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { name, memberIds } = req.body;

  if (!name || !Array.isArray(memberIds) || memberIds.length < 2) {
    sendError(res, "Group needs a name and at least 2 other members");
    return;
  }

  const conv = convRepo().create({ type: "group", name, createdBy: userId });
  await convRepo().save(conv);

  const allMembers = [...new Set([userId, ...memberIds])];
  const participants = allMembers.map((uid: string) =>
    partRepo().create({
      userId: uid,
      conversationId: conv.id,
      role: uid === userId ? "admin" : "member",
    })
  );
  await partRepo().save(participants);

  const full = await convRepo().findOne({
    where: { id: conv.id },
    relations: ["participants", "participants.user"],
  });
  sendSuccess(res, full, "Group created", 201);
}

// POST /conversations/:id/members — add member to group
export async function addGroupMember(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id } = req.params;
  const { newUserId } = req.body;

  const conv = await convRepo().findOne({ where: { id } });
  if (!conv || conv.type !== "group") {
    sendError(res, "Group not found", 404);
    return;
  }

  const requester = await partRepo().findOne({ where: { conversationId: id, userId } });
  if (!requester || requester.role !== "admin") {
    sendError(res, "Only admins can add members", 403);
    return;
  }

  const already = await partRepo().findOne({ where: { conversationId: id, userId: newUserId } });
  if (already) {
    sendError(res, "User already in group");
    return;
  }

  await partRepo().save(partRepo().create({ userId: newUserId, conversationId: id, role: "member" }));
  sendSuccess(res, null, "Member added");
}

// DELETE /conversations/:id/members/:memberId — remove member
export async function removeGroupMember(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { id, memberId } = req.params;

  const requester = await partRepo().findOne({ where: { conversationId: id, userId } });
  if (!requester || requester.role !== "admin") {
    sendError(res, "Only admins can remove members", 403);
    return;
  }

  await partRepo().delete({ conversationId: id, userId: memberId });
  sendSuccess(res, null, "Member removed");
}
