import express from "express";
import dotenv from "dotenv";
import webhookRouter from "./routes/webhook.js";
import { initDatabase } from "./db/init.js";

dotenv.config();

// Inicializar DB
initDatabase();

const app = express();
app.use(express.json());

// Webhook de WhatsApp
app.use("/webhook", webhookRouter);

// Puerto (Render usa process.env.PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
