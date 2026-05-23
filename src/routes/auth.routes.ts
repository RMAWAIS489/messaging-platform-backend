import { Router } from "express";
import { body } from "express-validator";
import { signup, login, getMe, updateProfile } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

router.post(
  "/signup",
  [
    body("username").trim().isLength({ min: 3, max: 30 }).withMessage("Username must be 3–30 chars"),
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 chars"),
  ],
  validate,
  signup
);

router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty(),
  ],
  validate,
  login
);

router.get("/me", authenticate, getMe);

router.patch(
  "/me",
  authenticate,
  upload.single("avatar"),
  updateProfile
);

export default router;
