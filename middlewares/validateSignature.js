// middlewares/validateSignature.js
import crypto from "crypto";

export const validateSignature = (req, res, next) => {
    const signature = req.headers["x-hub-signature-256"];
    if (!signature) {
        console.error("❌ No se recibió x-hub-signature-256");
        return res.sendStatus(403);
    }

    // ✅ req.rawBody se asegura de que sea string
    if (!req.rawBody) {
        console.error("❌ req.rawBody indefinido. Asegúrate de usar express.json({ verify: ... })");
        return res.sendStatus(400);
    }

    const expectedSignature =
        "sha256=" +
        crypto
            .createHmac("sha256", process.env.META_APP_SECRET)
            .update(req.rawBody)
            .digest("hex");

    if (signature !== expectedSignature) {
        console.error("❌ Firma inválida de WhatsApp");
        return res.sendStatus(403);
    }

    next();
};
