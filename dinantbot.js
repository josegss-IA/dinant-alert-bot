require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

// 🔑 Variables de entorno
const CHAT_BOT_TOKEN = process.env.CHAT_BOT_TOKEN; // 8383486013:...
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!CHAT_BOT_TOKEN || !OPENAI_API_KEY) {
  console.error("❌ Faltan CHAT_BOT_TOKEN u OPENAI_API_KEY en .env");
  process.exit(1);
}

// 👉 ID de tu usuario (el que vimos antes cuando le escribiste al bot)
const ALLOWED_USER_ID = 1448219107; // solo tú puedes consultar; quítalo si quieres público

const bot = new TelegramBot(CHAT_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const alertsFilePath = path.join(__dirname, "alerts.json");

// Leer alerts.json
function loadAlerts() {
  if (!fs.existsSync(alertsFilePath)) return [];
  try {
    const content = fs.readFileSync(alertsFilePath, "utf8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("⚠️ No se pudo leer alerts.json:", err.message);
    return [];
  }
}

// Filtrar por consulta estructurada
function queryAlerts(alerts, query) {
  const { intent, date, group, eventType } = query;

  let filtered = alerts;

  if (date) {
    // fecha en formato YYYY-MM-DD
    filtered = filtered.filter((a) => a.isoDatetime.startsWith(date));
  }

  if (group) {
    const groupLower = group.toLowerCase();
    filtered = filtered.filter(
      (a) => (a.group || "").toLowerCase().includes(groupLower)
    );
  }

  if (eventType && eventType !== "cualquiera") {
    const ev = eventType.toLowerCase();
    filtered = filtered.filter(
      (a) => (a.eventType || "").toLowerCase() === ev
    );
  }

  const total = filtered.length;

  return {
    total,
    sample: filtered.slice(0, 5),
  };
}

// --------------------------------------------
//   MANEJO DE MENSAJES EN DINANTBOT
// --------------------------------------------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  // Restringir a tu usuario
  if (chatId !== ALLOWED_USER_ID) {
    await bot.sendMessage(chatId, "Este bot es de uso interno.");
    return;
  }

  console.log("💬 Consulta de Jose:", text);

  const alerts = loadAlerts();
  if (alerts.length === 0) {
    await bot.sendMessage(chatId, "Todavía no tengo alertas registradas en alerts.json.");
    return;
  }

  try {
    // 1️⃣ Interpretar la pregunta en una consulta JSON
    const nlu = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Recibirás preguntas en español sobre alertas de flota (geocercas, conexión perdida, etc.). " +
            "Debes devolver SOLO un JSON con esta forma:\n" +
            "{ \"intent\": \"count_by_filters\", " +
            "  \"date\": string|null, " +
            "  \"group\": string|null, " +
            "  \"eventType\": \"salida_geocerca\"|\"entrada_geocerca\"|\"conexion_perdida\"|\"cualquiera\" }\n\n" +
            "- Si dice 'salidas de geocerca', usa eventType = \"salida_geocerca\".\n" +
            "- Si dice 'entradas a geocerca', usa eventType = \"entrada_geocerca\".\n" +
            "- Si menciona 'conexión perdida', usa eventType = \"conexion_perdida\".\n" +
            "- Si no menciona tipo claro, usa \"cualquiera\".\n" +
            "- Si menciona fecha específica tipo '2025-11-20' o '20 de noviembre de 2025', devuélvela como YYYY-MM-DD.\n" +
            "- Si dice 'hoy' o 'ayer', puedes dejar date = null (el sistema aún no soporta fechas relativas).",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const nluQuery = JSON.parse(nlu.choices[0].message.content);
    console.log("🔎 Consulta interpretada:", nluQuery);

    const result = queryAlerts(alerts, nluQuery);

    // 2️⃣ Redactar respuesta profesional
    const answer = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente profesional que responde sobre estadísticas de alertas de una flota industrial. " +
            "Responde en español, claro, breve y ejecutivo. Incluye el número total y, si es útil, menciona algunos ejemplos.",
        },
        {
          role: "user",
          content:
            "Pregunta original de Jose: " +
            text +
            "\n\nConsulta estructurada: " +
            JSON.stringify(nluQuery) +
            "\n\nResultado del sistema: " +
            JSON.stringify(result),
        },
      ],
    });

    const finalText = answer.choices[0].message.content;
    await bot.sendMessage(chatId, finalText);
  } catch (err) {
    console.error("❌ Error en DinantBot:", err.message);
    await bot.sendMessage(
      chatId,
      "Hubo un problema procesando la consulta. Intenta formularla de nuevo."
    );
  }
});

console.log("🤖 DinantBot listo para responder consultas sobre alerts.json...");

