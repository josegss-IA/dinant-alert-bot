require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

// -----------------------------
// 🔑 VARIABLES DE ENTORNO
// -----------------------------
const RECEIVER_BOT_TOKEN = String(process.env.RECEIVER_BOT_TOKEN || "");
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "");
const CHANNEL_ID = String(process.env.CHANNEL_ID || "");

if (!RECEIVER_BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
  console.error("❌ ERROR: Faltan variables en Railway (RECEIVER_BOT_TOKEN, OPENAI_API_KEY o CHANNEL_ID)");
  process.exit(1);
}

// Log mínimo para verificar que cargó bien (sin mostrar token completo)
console.log("✅ Variables cargadas:");
console.log("   CHANNEL_ID:", CHANNEL_ID);
console.log("   RECEIVER_BOT_TOKEN empieza con:", RECEIVER_BOT_TOKEN.slice(0, 10), "...");

// -----------------------------
// 🤖 BOT TELEGRAM (POLLING)
// -----------------------------
const receiverBot = new TelegramBot(RECEIVER_BOT_TOKEN, { polling: true });

// Manejar errores de polling (como EFATAL / AggregateError)
receiverBot.on("polling_error", (err) => {
  console.error("🚨 polling_error:", err.code || "", err.message || err.toString());
});

// -----------------------------
// 🧠 OPENAI
// -----------------------------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// -----------------------------
// 📁 ARCHIVO messages.json
// -----------------------------
const messagesFilePath = path.join(__dirname, "messages.json");

function appendMessageToFile(messageData) {
  let data = [];

  if (fs.existsSync(messagesFilePath)) {
    try {
      const fileContent = fs.readFileSync(messagesFilePath, "utf8") || "[]";
      data = JSON.parse(fileContent);
      if (!Array.isArray(data)) data = [];
    } catch (err) {
      console.error("⚠️ Error leyendo messages.json, se reinicia como []:", err.message);
      data = [];
    }
  }

  data.push(messageData);

  try {
    fs.writeFileSync(messagesFilePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("⚠️ Error escribiendo messages.json:", err.message);
  }
}

// -----------------------------
// 🚀 LOG INICIAL
// -----------------------------
console.log(`🤖 Bot escuchando SOLO el canal ${CHANNEL_ID}...`);

// -----------------------------
// 🔥 LISTENER DE MENSAJES DESDE CANAL
// -----------------------------
// IMPORTANTE: para CANALES se usa "channel_post", NO "message"
receiverBot.on("channel_post", async (msg) => {
  try {
    const chatId = String(msg.chat.id);
    const text = msg.text || msg.caption || "";

    // FILTRO: solo procesar el canal configurado
    if (chatId !== CHANNEL_ID) return;

    console.log("📩 Mensaje recibido del canal:", text);

    const messageData = {
      date: msg.date,
      chatId: msg.chat.id,
      chatTitle: msg.chat.title,
      messageId: msg.message_id,
      text
    };

    appendMessageToFile(messageData);

    if (!text || !text.trim()) {
      console.log("⚠️ Mensaje vacío, no se envía a OpenAI.");
      return;
    }

    // -----------------------------
    // 🧠 OPENAI - análisis de alerta
    // -----------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que analiza mensajes de alertas de geocercas Dinant. Resume brevemente el evento, identifica la ubicación (si existe), y determina si parece una alerta crítica o informativa."
        },
        { role: "user", content: text }
      ]
    });

    const aiResponse = completion.choices[0]?.message?.content || "";
    console.log("🤖 Respuesta OpenAI:", aiResponse);

    // Si en el futuro quieres que el bot RESPONDA en el canal, aquí iría:
    // await receiverBot.sendMessage(CHANNEL_ID, aiResponse);

  } catch (err) {
    console.error("❌ Error procesando mensaje:", err.message || err.toString());
  }
});
