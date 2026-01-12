import "dotenv/config";
import express from "express";
import webhookRouter from "./routes/webhook.js";
import chatwootRouter from "./routes/chatwoot.js";

const app = express();
app.use(express.json());
app.use("/webhook", webhookRouter);
app.use("/chatwoot", chatwootRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
);
