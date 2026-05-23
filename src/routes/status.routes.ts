import { Router } from "express";
import { createStatus, getStatuses, deleteStatus } from "../controllers/status.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

router.use(authenticate);

router.get("/", getStatuses);
router.post("/", upload.single("media"), createStatus);
router.delete("/:id", deleteStatus);

export default router;
