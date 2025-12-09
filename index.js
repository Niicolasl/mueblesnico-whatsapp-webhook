import express from "express";

const app = express();
app.use(express.json());

// *** VERIFICATION TOKEN (inventado por ti) ***
const VERIFY_TOKEN = "mueblesnico_token_123";

// *** WEBHOOK GET (verificación con Meta) ***
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verificado ✔");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
});

// *** WEBHOOK POST (mensajes de WhatsApp que llegan) ***
app.post("/webhook", (req, res) => {
  console.log("Mensaje recibido:");
  console.dir(req.body, { depth: null });

  res.sendStatus(200);
});

// Puerto Render (usa variable automática)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
