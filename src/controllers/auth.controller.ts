import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import { hashPassword, comparePassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { sendSuccess, sendError } from "../utils/response";

const userRepo = () => AppDataSource.getRepository(User);

export async function signup(req: Request, res: Response): Promise<void> {
  const { username, email, password } = req.body;

  const existing = await userRepo().findOne({
    where: [{ email }, { username }],
  });
  if (existing) {
    sendError(res, "Email or username already taken", 409);
    return;
  }

  const hashed = await hashPassword(password);
  const user = userRepo().create({ username, email, password: hashed });
  await userRepo().save(user);

  const token = signToken({ userId: user.id, email: user.email });
  sendSuccess(
    res,
    { token, user: sanitize(user) },
    "Account created successfully",
    201
  );
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  const user = await userRepo().findOne({ where: { email } });
  if (!user) {
    sendError(res, "Invalid credentials", 401);
    return;
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) {
    sendError(res, "Invalid credentials", 401);
    return;
  }

  const token = signToken({ userId: user.id, email: user.email });
  sendSuccess(res, { token, user: sanitize(user) }, "Login successful");
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) {
    sendError(res, "User not found", 404);
    return;
  }
  sendSuccess(res, sanitize(user));
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.userId;
  const { username, bio } = req.body;
  const file = (req as any).file as Express.Multer.File | undefined;

  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) {
    sendError(res, "User not found", 404);
    return;
  }

  if (username) user.username = username;
  if (bio !== undefined) user.bio = bio;
  if (file) user.avatar = `/uploads/${file.filename}`;

  await userRepo().save(user);
  sendSuccess(res, sanitize(user), "Profile updated");
}

function sanitize(user: User) {
  const { password, ...safe } = user;
  return safe;
}
