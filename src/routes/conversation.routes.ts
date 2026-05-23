import { Router } from "express";
import { body } from "express-validator";
import {
  getConversations,
  createDirectConversation,
  createGroupConversation,
  addGroupMember,
  removeGroupMember,
} from "../controllers/conversation.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";

const router = Router();

router.use(authenticate);

router.get("/", getConversations);

router.post(
  "/direct",
  [body("targetUserId").isUUID().withMessage("Valid user ID required")],
  validate,
  createDirectConversation
);

router.post(
  "/group",
  [
    body("name").trim().isLength({ min: 1, max: 100 }).withMessage("Group name required"),
    body("memberIds").isArray({ min: 2 }).withMessage("At least 2 members required"),
  ],
  validate,
  createGroupConversation
);

router.post("/:id/members", addGroupMember);
router.delete("/:id/members/:memberId", removeGroupMember);

export default router;
