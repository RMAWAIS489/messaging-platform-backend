import { Router } from "express";
import { searchUsers, getUserById } from "../controllers/user.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/search", searchUsers);
router.get("/:id", getUserById);

export default router;
