// server.js
import "dotenv/config";
import express from "express";
import webhookRouter from "./routes/webhook.js";
import chatwootRouter from "./routes/chatwoot.js";

const app = express();

// ✅ Parsear JSON y guardar rawBody para la firma de WhatsApp
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// 🔹 Log global de todas las requests
app.use((req, res, next) => {
    console.log("🌐 REQUEST:", req.method, req.url, "BODY:", JSON.stringify(req.body, null, 2));
    next();
});

// 🔹 Rutas principales
app.use("/webhook", webhookRouter);
app.use("/chatwoot", chatwootRouter);

// 🔹 Ruta de prueba para confirmar que Render levanta el servidor
app.get("/", (req, res) => {
    res.send("Servidor Muebles Nico activo 🚀");
});

// 🔹 Catch-all para rutas no definidas (opcional, para depuración)
app.all("*", (req, res) => {
    console.warn("⚠️ Ruta no encontrada:", req.method, req.url);
    res.status(404).send("Ruta no encontrada");
});

// 🔹 Puerto dinámico de Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`🔹 Prueba tu servidor: https://<tu-app>.onrender.com/`);
});
