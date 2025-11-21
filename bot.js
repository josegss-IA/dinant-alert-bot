require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

// 🔑 Tokens
const RECEIVER_BOT_TOKEN = process.env.RECEIVER_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = Number(process.env.CHANNEL_ID);

if (!RECEIVER_BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
  console.error("❌ Faltan variables en .env");
  process.exit(1);
}

// 🤖 Bot receptor
const receiverBot = new TelegramBot(RECEIVER_BOT_TOKEN, { polling: true });

// 🧠 OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// 📁 Archivo JSON donde se guardan los mensajes
const messagesFilePath = path.join(__dirname, "messages.json");

function appendMessageToFile(messageData) {
  let data = [];

  if (fs.existsSync(messagesFilePath)) {
    try {
      data = JSON.parse(fs.readFileSync(messagesFilePath, "utf8") || "[]");
    } catch (err) {
      console.error("⚠️ Error leyendo messages.json:", err.message);
    }
  }

  data.push(messageData);

  fs.writeFileSync(messagesFilePath, JSON.stringify(data, null, 2), "utf8");
}

// 🔊 Log
console.log(`🤖 Bot escuchando canal ${CHANNEL_ID}...`);

// 🔥 Listener principal
receiverBot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Solo canal específico
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

    if (!text.trim()) return;

    // Llamada a OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que analiza alertas de geocercas Dinant."
        },
        { role: "user", content: text }
      ]
    });

    console.log("🤖 Respuesta OpenAI:", completion.choices[0].message.content);

  } catch (err) {
    console.error("❌ Error procesando:", err.message);
  }
});