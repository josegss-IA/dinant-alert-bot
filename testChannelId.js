require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const RECEIVER_BOT_TOKEN = process.env.RECEIVER_BOT_TOKEN;

const bot = new TelegramBot(RECEIVER_BOT_TOKEN, { polling: true });

console.log("✅ Escuchando TODOS los mensajes que lleguen al bot...");

bot.on("channel_post", (msg) => {
  console.log("📩 Nuevo mensaje:");
  console.log("  chat.id:", msg.chat.id);
  console.log("  chat.title:", msg.chat.title);
  console.log("  chat.username:", msg.chat.username);
  console.log("  texto:", msg.text);
});
