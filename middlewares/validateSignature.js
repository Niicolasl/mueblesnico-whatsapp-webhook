import crypto from "crypto";

export const validateSignature = (req, res, next) => {
    const signature = req.headers["x-hub-signature-256"];
    if (!signature) return res.sendStatus(403);

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
