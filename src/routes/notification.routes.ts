import { Router } from "express";
import {
  getNotifications,
  markNotificationRead,
  markAllRead,
} from "../controllers/notification.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", getNotifications);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markNotificationRead);

export default router;
