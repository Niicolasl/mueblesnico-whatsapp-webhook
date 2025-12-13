import express from "express";
import { verifyToken } from "../verifyToken.js";
import { handleMessage } from "../services/whatsappService.js";

const router = express.Router();

// Verificación con Meta (GET)
router.get("/", verifyToken);

// Mensajes entrantes de WhatsApp (POST)
router.post("/", handleMessage);

export default router;
