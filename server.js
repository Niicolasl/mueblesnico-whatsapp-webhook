import express from "express";
import dotenv from "dotenv";
import webhookRouter from "./routes/webhook.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use("/webhook", webhookRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
