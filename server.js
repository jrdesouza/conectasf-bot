// server.js - Backend Unificado (Express + WhatsApp + Socket.IO)
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const pino = require("pino");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} = require("@whiskeysockets/baileys");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Configuração do Express
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do motor de templates EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

const CONFIG_PATH = path.join(__dirname, 'local_config.json');

// ========= SISTEMA DE LOGS DE ERRO =========
const ERROR_LOG_FILE = path.join(__dirname, 'error.log');

// Função para registrar erros da nossa aplicação com data e hora
function logAppError(context, error) {
    const timestamp = new Date().toLocaleString("pt-BR");
    const errDetails = error instanceof Error ? error.stack || error.message : error;
    const logEntry = `\n[${timestamp}] [${context}]\n${errDetails}\n---------------------------------------------------`;

    // Grava no arquivo
    fs.appendFileSync(ERROR_LOG_FILE, logEntry, 'utf8');

    // Mostra no terminal de forma resumida
    console.error(`❌ Erro em [${context}]:`, error instanceof Error ? error.message : error);
}

// Protetor global: impede que o Node feche o servidor do nada se houver um erro desconhecido
process.on('uncaughtException', (err) => {
    logAppError('Erro Fatal (Uncaught Exception)', err);
});
process.on('unhandledRejection', (reason) => {
    logAppError('Promessa Rejeitada (Unhandled Rejection)', reason);
});
// ===========================================


// Lê as configurações locais
function getLocalConfig() {
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const allowedIds = String(data.NUMERO_TESTE || "")
            .split(',')
            .map(id => id.trim().replace(/\D/g, ""))
            .filter(id => id.length > 0);

        return {
            DJANGO_HTTP_URL: data.DJANGO_HTTP_URL || "",
            DJANGO_WS_URL: data.DJANGO_WS_URL || "",
            BASE_URL: data.BASE_URL || "",
            API_TOKEN: data.API_TOKEN || "",
            NUMERO_TESTE: data.NUMERO_TESTE || "",
            MODO_TESTE: String(data.MODO_TESTE).toLowerCase() === "true",
            ALLOWED_IDS: allowedIds
        };
    } catch (e) {
        return { DJANGO_HTTP_URL: "", DJANGO_WS_URL: "", BASE_URL: "", API_TOKEN: "", NUMERO_TESTE: "", MODO_TESTE: true, ALLOWED_IDS:[] };
    }
}

// ==================== ROTAS DO PAINEL ====================
app.get("/", (req, res) => {
    const config = getLocalConfig();
    if (!config.API_TOKEN) return res.redirect("/settings");
    res.render("index");
});

app.get("/settings", (req, res) => {
    const config = getLocalConfig();
    res.render("settings", { config });
});

app.post("/settings", (req, res) => {
    const newConfig = {
        DJANGO_HTTP_URL: req.body.DJANGO_HTTP_URL ? req.body.DJANGO_HTTP_URL.replace(/\/$/, "") : "",
        DJANGO_WS_URL: req.body.DJANGO_WS_URL ? req.body.DJANGO_WS_URL.replace(/\/$/, "") : "",
        BASE_URL: req.body.BASE_URL ? req.body.BASE_URL.replace(/\/$/, "") : "",
        API_TOKEN: req.body.API_TOKEN || "",
        NUMERO_TESTE: req.body.NUMERO_TESTE || "",
        MODO_TESTE: req.body.MODO_TESTE === "on"
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 4));

    // Reconecta com as novas configurações se houver sessão ativa
    if (sessions["default"]) {
        connectToDjangoCloud(sessions["default"]);
    }

    res.redirect("/");
});

// ==================== WHATSAPP E WEBSOCKETS ====================

// Configura o Pino do Baileys para:
// 1. Ficar silencioso no terminal (level: 'error' não mostra info/warn)
// 2. Gravar TUDO que for erro no nosso error.log
const logger = pino(
    { level: "error" },
    pino.destination({ dest: ERROR_LOG_FILE, append: true })
);

const sessions = {};
const bootTime = Math.floor(Date.now() / 1000);

let waStatus = "starting";
let cloudStatus = "disconnected";
let currentQr = null;
let djangoWs = null;

// Controle de reconexão inteligente (Exponential Backoff)
let cloudReconnectDelay = 5000; // Começa em 5 segundos
const MAX_RECONNECT_DELAY = 120000; // Máximo de 2 minutos (120.000 ms)

// ========= GERENCIAMENTO DE ESTADO DE USUÁRIOS E LIMPEZA =========
const USERS_FILE = path.join(__dirname, 'users.json');
let userStates = {};

if (fs.existsSync(USERS_FILE)) {
    try { userStates = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
    catch (error) { userStates = {}; }
}

function saveUserStates() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(userStates, null, 2));
}

// Rotina para limpar usuários inativos há mais de 24 horas
function cleanInactiveUsers() {
    const now = Date.now();
    const INACTIVITY_LIMIT = 24 * 60 * 60 * 1000; // 24 horas
    let cleanedCount = 0;

    for (const jid in userStates) {
        if (now - userStates[jid].lastSeen > INACTIVITY_LIMIT) {
            delete userStates[jid];
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        saveUserStates();
        console.log(`🧹 Limpeza concluída: ${cleanedCount} usuário(s) inativo(s) removido(s) do users.json.`);
    } else {
        console.log("🧹 Limpeza concluída: Nenhum usuário inativo para remover.");
    }
}

cleanInactiveUsers();
// =================================================================

function emitStatus() {
    let finalStatus = waStatus;
    if (waStatus === "connected") {
        if (cloudStatus === "connected") finalStatus = "connected";
        else if (cloudStatus === "connecting") finalStatus = "cloud_connecting";
        else finalStatus = "cloud_disconnected";
    }
    io.emit("status_update", { status: finalStatus, qr: currentQr });
}

io.on("connection", (socket) => {
    emitStatus();
});

function connectToDjangoCloud(sock) {
    if (djangoWs) {
        djangoWs.removeAllListeners();
        try { djangoWs.close(); } catch(e){}
    }

    const config = getLocalConfig();
    if (!config.API_TOKEN) {
        console.log("❌ API_TOKEN não configurado. Conexão com nuvem cancelada.");
        return;
    }

    const wsUrl = `${config.DJANGO_WS_URL}/${config.API_TOKEN}/`;
    console.log(`☁️ Tentando conectar na Nuvem: ${wsUrl}`);

    cloudStatus = "connecting";
    emitStatus();

    djangoWs = new WebSocket(wsUrl);

    djangoWs.on('open', () => {
        console.log("☁️✅ Conectado à Nuvem com sucesso!");
        cloudStatus = "connected";
        cloudReconnectDelay = 5000; // RESET DO BACKOFF após sucesso
        emitStatus();
    });

    djangoWs.on('message', async (data) => {
        try {
            const payload = JSON.parse(data);
            if (payload.action === 'send_message' && sock) {
                const config = getLocalConfig();
                if (config.MODO_TESTE) {
                    const targetClean = payload.phone.replace(/\D/g, "");
                    if (!config.ALLOWED_IDS.includes(targetClean)) return;
                }
                await sock.sendMessage(payload.phone, { text: payload.text });
                console.log(`✅ Mensagem enviada via Nuvem para ${payload.phone}!`);
            }
        } catch (err) {
            logAppError('Processar Mensagem WS da Nuvem', err);
        }
    });

    djangoWs.on('error', (err) => {
        logAppError('Conexão WebSocket Nuvem', err);
        cloudStatus = "disconnected";
        emitStatus();
    });

    djangoWs.on('close', () => {
        console.log(`☁️⚠️ Nuvem offline. Nova tentativa em ${cloudReconnectDelay / 1000} segundos...`);
        cloudStatus = "disconnected";
        emitStatus();

        // Aplica o tempo atual de espera
        setTimeout(() => connectToDjangoCloud(sock), cloudReconnectDelay);

        // Multiplica o tempo de espera para a próxima falha, limitando ao máximo de 2 minutos
        cloudReconnectDelay = Math.min(cloudReconnectDelay * 2, MAX_RECONNECT_DELAY);
    });
}

async function createSession(sessionId = "default") {
  const sessionPath = path.join(__dirname, "sessions", sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger, // Passa nosso logger configurado que aponta pro error.log
    printQRInTerminal: false,
    browser:["ConectaSF Bot", "Chrome", "1.0.0"]
  });

  sessions[sessionId] = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
        currentQr = await QRCode.toDataURL(qr);
        waStatus = "qr";
        emitStatus();
        console.log("📸 QR Code aguardando leitura.");
    }

    if (connection === "connecting") {
        waStatus = "connecting";
        emitStatus();
        console.log("⏳ Sincronizando...");
    }

    if (connection === "open") {
      waStatus = "connected";
      emitStatus();
      console.log(`✅ WhatsApp Conectado.`);
      connectToDjangoCloud(sock);
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      waStatus = shouldReconnect ? "reconnecting" : "disconnected";
      emitStatus();

      if (shouldReconnect) {
          console.log("⚠️ WhatsApp desconectado, reconectando...");
          setTimeout(() => createSession(sessionId), 3000);
      } else {
          console.log(`❌ WhatsApp desconectado manualmente.`);
          fs.rmSync(sessionPath, { recursive: true, force: true });
          setTimeout(() => createSession(sessionId), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message) return;
    const remoteJid = msg.key.remoteJid;
    const isMe = msg.key.fromMe;
    const myJid = jidNormalizedUser(sock.user.id);

    if (isMe || remoteJid === myJid) return;
    if (!(remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid'))) return;
    if (msg.messageTimestamp < bootTime) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text) return;

    const config = getLocalConfig();
    const senderClean = remoteJid.replace(/\D/g, "");
    if (config.MODO_TESTE && !config.ALLOWED_IDS.includes(senderClean)) return;

    let botConfig;
    try {
        const res = await axios.get(`${config.DJANGO_HTTP_URL}/bot-config/`, {
            headers: { 'Authorization': `Bearer ${config.API_TOKEN}` }
        });
        botConfig = res.data;
    } catch (e) {
        logAppError('Buscando Configurações na Nuvem (API)', e);
        return;
    }

    if (!botConfig.bot_active) return;

    const matchPedido = text.match(/pedido\s*#(\d+)/i);
    if (matchPedido) {
        const numeroPedido = matchPedido[1];
        axios.post(`${config.DJANGO_HTTP_URL}/bot-confirm-order/`, {
            from_jid: remoteJid, order_number: numeroPedido,
        }, { headers: { 'Authorization': `Bearer ${config.API_TOKEN}` } })
        .catch((e) => {
            logAppError('Confirmar Pedido na Nuvem (API)', e);
        });

        try {
            await sock.sendMessage(remoteJid, { text: `✅ Seu pedido #${numeroPedido} foi confirmado!` });
        } catch(e) { logAppError('Enviar Mensagem WhatsApp', e); }
        return;
    }

    const now = Date.now();
    if (!userStates[remoteJid]) userStates[remoteJid] = { lastSeen: 0, pausedUntil: 0, lastClosedMsg: 0 };
    const user = userStates[remoteJid];

    if (user.pausedUntil > now) return;

    if (!botConfig.is_open) {
        if (now - user.lastClosedMsg > 12 * 60 * 60 * 1000) {
            try {
                await sock.sendMessage(remoteJid, { text: botConfig.closed_message });
                user.lastClosedMsg = now;
                saveUserStates();
            } catch(e) { logAppError('Enviar Msg Estabelecimento Fechado', e); }
        }
        return;
    }

    const isNewSession = (now - user.lastSeen > 12 * 60 * 60 * 1000);
    user.lastSeen = now;
    saveUserStates();

    try {
        if (text === '1') {
            const baseUrl = config.BASE_URL.replace(/\/+$/, '');
            await sock.sendMessage(remoteJid, {
                text: `🍔 *BEM-VINDO AO NOSSO CARDÁPIO!*\nExplore nossas opções e escolha o que vai matar sua fome hoje 😋\n\n━━━━━━━━━━━━━━━\n📋 *Ver Cardápio:*\n🔗 ${baseUrl}/${botConfig.slug}\n━━━━━━━━━━━━━━━\n\n🛒 Pedido rápido • Fácil • Prático`
            });
        } else if (text === '2') {
            await sock.sendMessage(remoteJid, { text: botConfig.human_message });
            user.pausedUntil = now + (2 * 60 * 60 * 1000);
            saveUserStates();
        } else {
            if (isNewSession) await sock.sendMessage(remoteJid, { text: botConfig.greeting_message });
        }
    } catch (e) {
        logAppError('Enviar Msg Menu Principal', e);
    }
  });
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Unificado rodando na porta ${PORT}`);
    console.log(`📋 Painel web: http://localhost:${PORT}`);
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);
    createSession("default");
});