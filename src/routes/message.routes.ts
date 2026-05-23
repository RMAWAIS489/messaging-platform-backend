import { Router } from "express";
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markRead,
  searchMessages,
} from "../controllers/message.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

router.use(authenticate);

// Search across messages
router.get("/search", searchMessages);

// Per-conversation messages
router.get("/conversations/:id/messages", getMessages);
router.post("/conversations/:id/messages", upload.single("file"), sendMessage);

// Individual message actions
router.patch("/:id", editMessage);
router.delete("/:id", deleteMessage);
router.patch("/:id/read", markRead);

export default router;
