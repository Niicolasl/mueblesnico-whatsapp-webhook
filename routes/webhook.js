import express from "express";
import { verifyToken } from "../verifyToken.js";
import { handleMessage } from "../services/whatsappService.js";
import { validateSignature } from "../middlewares/validateSignature.js";

const router = express.Router();

// 🔐 Verificación inicial de Meta (GET)
router.get("/", verifyToken);

// 🔒 Mensajes entrantes de WhatsApp (POST)
// Primero validamos firma, luego procesamos mensaje
router.post("/", validateSignature, handleMessage);

export default router;
