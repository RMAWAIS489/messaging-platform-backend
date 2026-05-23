import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import { sendSuccess, sendError } from "../utils/response";
import { ILike } from "typeorm";
import { isUserOnline } from "../config/redis";

const userRepo = () => AppDataSource.getRepository(User);

// GET /users/search?q=username
export async function searchUsers(req: Request, res: Response): Promise<void> {
  const { q } = req.query;
  const currentUserId = (req as any).user?.userId;

  if (!q) {
    sendError(res, "Search query required");
    return;
  }

  const users = await userRepo().find({
    where: [
      { username: ILike(`%${q}%`) },
      { email: ILike(`%${q}%`) },
    ],
    select: ["id", "username", "email", "avatar", "bio", "lastSeen"],
    take: 20,
  });

  const filtered = users.filter((u) => u.id !== currentUserId);

  const withStatus = await Promise.all(
    filtered.map(async (u) => ({
      ...u,
      isOnline: await isUserOnline(u.id),
    }))
  );

  sendSuccess(res, withStatus);
}

// GET /users/:id
export async function getUserById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const user = await userRepo().findOne({
    where: { id },
    select: ["id", "username", "email", "avatar", "bio", "lastSeen", "createdAt"],
  });

  if (!user) {
    sendError(res, "User not found", 404);
    return;
  }

  const isOnline = await isUserOnline(id);
  sendSuccess(res, { ...user, isOnline });
}
