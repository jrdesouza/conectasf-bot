const socket = io();

// Mapa para armazenar os intervalos de polling de cada sessão
const pollIntervals = {};

document.getElementById('startSession').addEventListener('click', async () => {
    const sessionIdInput = document.getElementById('sessionIdInput');
    const sessionId = sessionIdInput.value.trim() || undefined;

    try {
        const response = await fetch('/session/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: sessionId })
        });
        const data = await response.json();
        if (data.session) {
            sessionIdInput.value = '';
            addSessionCard(data.session);
            socket.emit('join-session', data.session);
        }
    } catch (error) {
        alert('Erro ao iniciar sessão: ' + error.message);
    }
});

function addSessionCard(sessionId) {
    if (document.getElementById(`card-${sessionId}`)) return;

    const sessionsDiv = document.getElementById('sessionsList');
    const card = document.createElement('div');
    card.id = `card-${sessionId}`;
    card.className = 'session-card';
    card.innerHTML = `
        <div class="session-header">
            <span class="session-id">${sessionId.substring(0, 8)}...</span>
            <span class="status connecting">Conectando...</span>
        </div>
        <div class="qr-container" id="qr-${sessionId}">
            <p>Aguardando QR code...</p>
        </div>
        <div class="message-form" style="display: none;" id="msg-form-${sessionId}">
            <input type="text" placeholder="Número (ex: 5511999999999)" id="to-${sessionId}">
            <input type="text" placeholder="Mensagem" id="text-${sessionId}">
            <button onclick="sendMessage('${sessionId}')">Enviar</button>
        </div>
    `;
    sessionsDiv.appendChild(card);

    // Inicia polling de fallback (caso o socket não entregue)
    pollIntervals[sessionId] = setInterval(async () => {
        try {
            const response = await fetch(`/session/qr/${sessionId}`);
            const data = await response.json();
            if (data.qr) {
                console.log(`Polling: QR obtido para ${sessionId}`);
                displayQR(sessionId, data.qr);
                clearInterval(pollIntervals[sessionId]);
                delete pollIntervals[sessionId];
            }
        } catch (e) {}
    }, 3000);
}

// Eventos globais do socket (uma única vez)
socket.on('qr', ({ sessionId, qr }) => {
    console.log(`QR recebido via socket para ${sessionId}`);
    displayQR(sessionId, qr);
    // Para o polling se estiver rodando
    if (pollIntervals[sessionId]) {
        clearInterval(pollIntervals[sessionId]);
        delete pollIntervals[sessionId];
    }
    updateStatus(sessionId, 'connecting');
});

socket.on('qr-raw', ({ sessionId, qr }) => {
    console.log(`QR cru recebido via socket para ${sessionId}`);
    // Gera imagem a partir da string crua (usando API do Google Charts como fallback)
    const qrImage = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(qr)}`;
    displayQR(sessionId, qrImage);
    if (pollIntervals[sessionId]) {
        clearInterval(pollIntervals[sessionId]);
        delete pollIntervals[sessionId];
    }
    updateStatus(sessionId, 'connecting');
});

socket.on('connected', ({ sessionId }) => {
    console.log(`Conectado: ${sessionId}`);
    updateStatus(sessionId, 'connected');
    document.getElementById(`qr-${sessionId}`).style.display = 'none';
    document.getElementById(`msg-form-${sessionId}`).style.display = 'flex';
    if (pollIntervals[sessionId]) {
        clearInterval(pollIntervals[sessionId]);
        delete pollIntervals[sessionId];
    }
});

socket.on('disconnected', ({ sessionId }) => {
    console.log(`Desconectado: ${sessionId}`);
    updateStatus(sessionId, 'disconnected');
    document.getElementById(`qr-${sessionId}`).style.display = 'block';
    document.getElementById(`qr-${sessionId}`).innerHTML = '<p>Sessão encerrada. Crie uma nova.</p>';
    document.getElementById(`msg-form-${sessionId}`).style.display = 'none';
    if (pollIntervals[sessionId]) {
        clearInterval(pollIntervals[sessionId]);
        delete pollIntervals[sessionId];
    }
});

socket.on('reconnecting', ({ sessionId }) => {
    console.log(`Reconectando: ${sessionId}`);
    updateStatus(sessionId, 'connecting');
    document.getElementById(`qr-${sessionId}`).style.display = 'block';
    document.getElementById(`qr-${sessionId}`).innerHTML = '<p>Reconectando, aguarde QR...</p>';
    document.getElementById(`msg-form-${sessionId}`).style.display = 'none';
    // Reinicia polling
    if (!pollIntervals[sessionId]) {
        pollIntervals[sessionId] = setInterval(async () => {
            try {
                const response = await fetch(`/session/qr/${sessionId}`);
                const data = await response.json();
                if (data.qr) {
                    displayQR(sessionId, data.qr);
                    clearInterval(pollIntervals[sessionId]);
                    delete pollIntervals[sessionId];
                }
            } catch (e) {}
        }, 3000);
    }
});

socket.on('status', ({ sessionId, status }) => {
    updateStatus(sessionId, status);
    if (status === 'connected') {
        document.getElementById(`qr-${sessionId}`).style.display = 'none';
        document.getElementById(`msg-form-${sessionId}`).style.display = 'flex';
    }
});

function displayQR(sessionId, qrDataUrl) {
    const container = document.getElementById(`qr-${sessionId}`);
    if (!container) return;
    container.innerHTML = `<img src="${qrDataUrl}" alt="QR Code" style="max-width:200px;">`;
}

function updateStatus(sessionId, status) {
    const card = document.getElementById(`card-${sessionId}`);
    if (card) {
        const statusSpan = card.querySelector('.status');
        statusSpan.className = `status ${status}`;
        statusSpan.textContent = status === 'connected' ? 'Conectado' :
                                 status === 'connecting' ? 'Conectando...' : 'Desconectado';
    }
}

async function sendMessage(sessionId) {
    const toInput = document.getElementById(`to-${sessionId}`);
    const textInput = document.getElementById(`text-${sessionId}`);
    const to = toInput.value.trim();
    const text = textInput.value.trim();

    if (!to || !text) {
        alert('Preencha número e mensagem');
        return;
    }

    try {
        const response = await fetch('/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: sessionId, number: to, text })
        });
        const data = await response.json();
        if (data.status === 'sent') {
            alert('Mensagem enviada!');
            textInput.value = '';
        } else {
            alert('Erro: ' + (data.error || 'desconhecido'));
        }
    } catch (error) {
        alert('Erro ao enviar: ' + error.message);
    }
}

// Ao carregar, lista as sessões existentes
window.addEventListener('load', async () => {
    try {
        const response = await fetch('/sessions');
        const sessions = await response.json();
        sessions.forEach(s => {
            addSessionCard(s.id);
            socket.emit('join-session', s.id);
        });
    } catch (error) {
        console.error('Erro ao carregar sessões:', error);
    }
});