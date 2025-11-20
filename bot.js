require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

// 🔑 Variables de entorno
const RECEIVER_BOT_TOKEN = process.env.RECEIVER_BOT_TOKEN;
const CHAT_BOT_TOKEN = process.env.CHAT_BOT_TOKEN; 
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = Number(process.env.CHANNEL_ID); // -1003339687270

if (!RECEIVER_BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
  console.error("❌ Faltan variables en el .env (RECEIVER_BOT_TOKEN, OPENAI_API_KEY o CHANNEL_ID)");
  process.exit(1);
}

// 🤖 Bot que LEE mensajes del canal
const receiverBot = new TelegramBot(RECEIVER_BOT_TOKEN, {
  polling: true,
});

// (Opcional) Bot para responder o mandar mensajes privados
let chatBot = null;
if (CHAT_BOT_TOKEN) {
  chatBot = new TelegramBot(CHAT_BOT_TOKEN, { polling: false });
}

// 🧠 Cliente de OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Rutas a archivos de almacenamiento
const messagesFilePath = path.join(__dirname, "messages.json");
const alertsFilePath = path.join(__dirname, "alerts.json");

// Guardar mensajes crudos en JSON (histórico)
function appendMessageToFile(messageData) {
  let data = [];
  if (fs.existsSync(messagesFilePath)) {
    try {
      const fileContent = fs.readFileSync(messagesFilePath, "utf8");
      data = JSON.parse(fileContent || "[]");
    } catch (err) {
      console.error("⚠️ No se pudo leer messages.json, se reinicia:", err.message);
    }
  }

  data.push(messageData);
  fs.writeFileSync(messagesFilePath, JSON.stringify(data, null, 2), "utf8");
}

// Guardar alerta estructurada para consultas posteriores
function appendAlertToFile(alert) {
  let data = [];
  if (fs.existsSync(alertsFilePath)) {
    try {
      const fileContent = fs.readFileSync(alertsFilePath, "utf8");
      data = JSON.parse(fileContent || "[]");
    } catch (err) {
      console.error("⚠️ No se pudo leer alerts.json, se reinicia:", err.message);
    }
  }

  data.push(alert);
  fs.writeFileSync(alertsFilePath, JSON.stringify(data, null, 2), "utf8");
}

// --------------------------------------------
//   FUNCIÓN PRINCIPAL QUE PROCESA MENSAJES
// --------------------------------------------
async function handleMessage(msg) {
  try {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Solo procesar mensajes del canal configurado
    if (chatId !== CHANNEL_ID) {
      return;
    }

    console.log("📩 Mensaje nuevo del canal:", text);

    // Guardar en archivo crudo
    const messageData = {
      date: msg.date,
      isoDatetime: new Date(msg.date * 1000).toISOString(),
      chatId: msg.chat.id,
      chatTitle: msg.chat.title || "",
      messageId: msg.message_id,
      text: text,
    };
    appendMessageToFile(messageData);

    if (!text.trim()) return;

    // 1️⃣ Llamada a OpenAI para resumen / acción recomendada (log en consola)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que analiza alertas de geocercas de una empresa industrial. Da un resumen muy corto y una acción recomendada.",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const aiReply = completion.choices[0].message.content;
    console.log("🤖 Respuesta de OpenAI:", aiReply);

        // 2️⃣ Llamada a OpenAI para EXTRAER CAMPOS ESTRUCTURADOS
    // Queremos algo tipo:
    // {
    //   "unit": "...",
    //   "group": "...",
    //   "geofence": "...",
    //   "event_type": "salida_geocerca" | "entrada_geocerca" | "conexion_perdida" | "otro"
    // }
    let structured = null;
    try {
      const extraction = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Recibirás un mensaje de alerta de Telegram proveniente de Wialon u otra plataforma de flota. " +
              "El texto puede contener datos como unidad (ej. 'HDA9864 Mulita Volvo'), " +
              "tipo de evento (ej. 'conexión perdida', 'salió de geocerca', 'entró a geocerca'), " +
              "geocerca (nombre del lugar) y grupo (ej. 'GRUPO OCCIDENTE', 'GRUPO ATLÁNTIDA').\n\n" +
              "Debes devolver ÚNICAMENTE un JSON con esta forma exacta:\n" +
              "{ \"unit\": string|null, \"group\": string|null, \"geofence\": string|null, " +
              "\"event_type\": \"salida_geocerca\"|\"entrada_geocerca\"|\"conexion_perdida\"|\"otro\" }\n\n" +
              "- Si ves palabras como 'conexión perdida' o 'lost connection', usa event_type = \"conexion_perdida\".\n" +
              "- Si ves 'salió de geocerca', 'geofence out', 'geofence exit', usa event_type = \"salida_geocerca\".\n" +
              "- Si ves 'entró a geocerca', 'geofence in', 'geofence enter', usa event_type = \"entrada_geocerca\".\n" +
              "- Si no estás seguro, usa event_type = \"otro\".\n" +
              "- Si no se menciona grupo explícito, usa group = null.\n" +
              "- Si no se menciona geocerca explícita, usa geofence = null.\n" +
              "- Si no se menciona unidad, usa unit = null.\n" +
              "Devuelve solo el JSON, sin texto adicional.",
          },
          {
            role: "user",
            content: text,
          },
        ],
      });

      structured = JSON.parse(extraction.choices[0].message.content);
    } catch (err) {
      console.error("⚠️ No se pudo extraer estructura con OpenAI:", err.message);
    }

    const alertRecord = {
      ts: msg.date, // segundos desde epoch
      isoDatetime: new Date(msg.date * 1000).toISOString(),
      rawText: text,
      unit: structured?.unit || null,
      group: structured?.group || null,
      geofence: structured?.geofence || null,
      eventType: structured?.event_type || "otro",
    };

    appendAlertToFile(alertRecord);
    console.log("💾 Alerta guardada en alerts.json:", alertRecord);
