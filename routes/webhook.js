import express from "express";
import { verifyToken } from "../verifyToken.js";
import { handleMessage } from "../services/whatsappService.js";

const router = express.Router();

router.get("/", verifyToken);

router.post("/", handleMessage);

export default router;
