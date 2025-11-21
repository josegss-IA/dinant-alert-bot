require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

// -----------------------------
// 🔑 VARIABLES DE ENTORNO
// -----------------------------
const RECEIVER_BOT_TOKEN = String(process.env.RECEIVER_BOT_TOKEN || "");
const CHAT_BOT_TOKEN = String(process.env.CHAT_BOT_TOKEN || "");
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "");
const CHANNEL_ID = String(process.env.CHANNEL_ID || "");

if (!RECEIVER_BOT_TOKEN || !CHAT_BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
  console.error(
    "❌ ERROR: Faltan variables en Railway (RECEIVER_BOT_TOKEN, CHAT_BOT_TOKEN, OPENAI_API_KEY o CHANNEL_ID)"
  );
  process.exit(1);
}

// Log mínimo para verificar que cargó bien (sin mostrar token completo)
console.log("✅ Variables cargadas:");
console.log("   CHANNEL_ID:", CHANNEL_ID);
console.log("   RECEIVER_BOT_TOKEN empieza con:", RECEIVER_BOT_TOKEN.slice(0, 10), "...");
console.log("   CHAT_BOT_TOKEN empieza con:", CHAT_BOT_TOKEN.slice(0, 10), "...");

// -----------------------------
// 🤖 BOTS TELEGRAM (POLLING)
// -----------------------------
const receiverBot = new TelegramBot(RECEIVER_BOT_TOKEN, { polling: true });
const chatBot = new TelegramBot(CHAT_BOT_TOKEN, { polling: true });

// Manejar errores de polling
receiverBot.on("polling_error", (err) => {
  console.error("🚨 polling_error RECEIVER:", err.code || "", err.message || err.toString());
});
chatBot.on("polling_error", (err) => {
  console.error("🚨 polling_error CHAT:", err.code || "", err.message || err.toString());
});

// -----------------------------
// 🧠 OPENAI
// -----------------------------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// -----------------------------
// 📁 ARCHIVO messages.json
// -----------------------------
const messagesFilePath = path.join(__dirname, "messages.json");

function loadMessages() {
  if (!fs.existsSync(messagesFilePath)) return [];
  try {
    const content = fs.readFileSync(messagesFilePath, "utf8") || "[]";
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("⚠️ Error leyendo messages.json:", err.message);
    return [];
  }
}

function appendMessageToFile(messageData) {
  const data = loadMessages();
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
console.log(`🤖 Bot receptor escuchando SOLO el canal ${CHANNEL_ID}...`);
console.log(`💬 Bot de chat listo para hablar en @IADinant_bot (CHAT_BOT_TOKEN).`);

// -----------------------------
// 🔥 LISTENER DEL CANAL (RECEIVER BOT)
// -----------------------------
receiverBot.on("channel_post", async (msg) => {
  try {
    const chatId = String(msg.chat.id);
    const text = msg.text || msg.caption || "";

    if (chatId !== CHANNEL_ID) return;

    console.log("📩 [CANAL] Mensaje recibido:", text);

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

    // Aquí SOLO analizamos para log. Si no quieres gastar tokens, puedes comentar esto.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que analiza mensajes de alertas de geocercas Dinant. Resume brevemente el evento, identifica ubicación (si existe) y clasifica si parece crítica o informativa."
        },
        { role: "user", content: text }
      ]
    });

    const aiResponse = completion.choices[0]?.message?.content || "";
    console.log("🤖 [CANAL] Respuesta OpenAI (solo log):", aiResponse);

    // Si en el futuro quieres push a otro lado, aquí se puede enviar.

  } catch (err) {
    console.error("❌ Error procesando mensaje de canal:", err.message || err.toString());
  }
});

// -----------------------------
// 💬 BOT DE CHAT: INTERFAZ PARA CONSULTAS
// -----------------------------

// Mensaje de bienvenida y ayuda básica
chatBot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (!text) return;

  // Comandos básicos
  if (text === "/start") {
    await chatBot.sendMessage(
      chatId,
      "Hola, soy el bot de análisis de alertas Dinant.\n\n" +
        "Comandos disponibles:\n" +
        "/ultimo - Analizar la última alerta recibida del canal\n" +
        "/resumen - Resumen de las últimas 20 alertas\n" +
        "O mándame una pregunta libre sobre las alertas (ej: '¿cuántas alertas hay de la última hora?')."
    );
    return;
  }

  if (text === "/ultimo") {
    const all = loadMessages();
    if (all.length === 0) {
      await chatBot.sendMessage(chatId, "Aún no tengo alertas registradas en el sistema.");
      return;
    }
    const last = all[all.length - 1];

    const prompt = `
Tienes la última alerta de geocerca Dinant:

Texto: "${last.text}"
Fecha (epoch): ${last.date}

1. Resume brevemente lo que pasó.
2. Si ves ubicación o pista de lugar, descríbelo.
3. Indica si parece alerta crítica, media o informativa.
4. Sugiere una acción corta (máx 1 oración).
    `.trim();

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Eres un analista de flota Dinant. Respondes en español, claro y conciso."
          },
          { role: "user", content: prompt }
        ]
      });

      const aiResponse = completion.choices[0]?.message?.content || "No pude generar análisis.";
      await chatBot.sendMessage(
        chatId,
        `📌 *Última alerta:*\n${last.text}\n\n🤖 *Análisis:*\n${aiResponse}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("❌ Error en /ultimo:", err.message || err.toString());
      await chatBot.sendMessage(chatId, "Hubo un error analizando la última alerta.");
    }
    return;
  }

  if (text === "/resumen") {
    const all = loadMessages();
    if (all.length === 0) {
      await chatBot.sendMessage(chatId, "Aún no tengo alertas registradas para resumir.");
      return;
    }

    const lastN = all.slice(-20); // últimas 20
    const joined = lastN.map((m, i) => `${i + 1}. ${m.text}`).join("\n");

    const prompt = `
Tienes las últimas ${lastN.length} alertas de geocerca Dinant (texto libre):

${joined}

1. Haz un resumen ejecutivo de lo más importante.
2. Menciona patrones (frecuencia de lugares, tipos de eventos).
3. Señala si ves algo que parezca crítico o repetitivo.
4. Propón 2–3 ideas de alertas específicas o dashboards que ayudarían a monitorear esto.
    `.trim();

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Eres un analista de operaciones y flota de Dinant. Respondes en español y orientado a negocio."
          },
          { role: "user", content: prompt }
        ]
      });

      const aiResponse = completion.choices[0]?.message?.content || "No pude generar el resumen.";
      await chatBot.sendMessage(chatId, `📊 *Resumen de las últimas alertas:*\n\n${aiResponse}`, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("❌ Error en /resumen:", err.message || err.toString());
      await chatBot.sendMessage(chatId, "Hubo un error generando el resumen.");
    }
    return;
  }

  // Pregunta libre del usuario sobre las alertas
  // (estadísticas, geolocalización, patrones, etc.)
  const all = loadMessages();
  if (all.length === 0) {
    await chatBot.sendMessage(
      chatId,
      "Todavía no tengo datos de alertas. Espera a que el canal envíe algunas."
    );
    return;
  }

  const last50 = all.slice(-50); // límite para no mandar demasiado texto
  const context = last50.map((m, i) => `${i + 1}. ${m.text}`).join("\n");

  const freePrompt = `
El usuario tiene la siguiente pregunta sobre las alertas de geocercas Dinant:

"${text}"

Tienes contexto con hasta 50 alertas recientes:

${context}

Responde en español y, si no puedes responder con precisión, explícalo y sugiere qué dato faltaría.
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un analista de datos de flota Dinant. Usas solo la información que se te da y respondes claro, breve y en español."
        },
        { role: "user", content: freePrompt }
      ]
    });

    const aiResponse = completion.choices[0]?.message?.content || "No pude responder a la consulta.";
    await chatBot.sendMessage(chatId, aiResponse);
  } catch (err) {
    console.error("❌ Error en pregunta libre:", err.message || err.toString());
    await chatBot.sendMessage(chatId, "Hubo un error procesando tu pregunta.");
  }
});
