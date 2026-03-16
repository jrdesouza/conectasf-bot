//// main.js - Inicia o servidor e abre a janela do App
//const { app, BrowserWindow } = require('electron');
//const { spawn } = require('child_process');
//
//let mainWindow;
//let nodeProc;
//
//function startServer() {
//    console.log("🚀 Iniciando servidor Node Unificado...");
//    nodeProc = spawn("node", ["server.js"]);
//
//    nodeProc.stdout.on('data', (d) => console.log(`[SISTEMA]: ${d.toString().trim()}`));
//    nodeProc.stderr.on('data', (d) => console.error(`[ERRO]: ${d.toString().trim()}`));
//}
//
//function loadAppURL(win) {
//    win.loadURL('http://localhost:3000').catch(() => {
//        setTimeout(() => loadAppURL(win), 1500); // Tenta de novo se o servidor não subiu ainda
//    });
//}
//
//app.whenReady().then(() => {
//    startServer();
//
//    mainWindow = new BrowserWindow({
//        width: 850,
//        height: 750,
//        minWidth: 600,
//        minHeight: 700,
//        title: "Bot WhatsApp - Painel",
//        autoHideMenuBar: true,
//        backgroundColor: '#f3f4f6'
//    });
//
//    // Tela de carregamento enquanto o Node liga
//    mainWindow.loadURL(`data:text/html;charset=utf-8,
//        <html style="background:#f3f4f6; display:flex; align-items:center; justify-content:center; font-family:sans-serif;">
//            <h2 style="color:#666;">Iniciando os motores do robô...</h2>
//        </html>`);
//
//    setTimeout(() => loadAppURL(mainWindow), 2000);
//});
//
//app.on('window-all-closed', () => {
//    if (nodeProc) nodeProc.kill();
//    app.quit();
//});

// main.js - Inicia o servidor embutido, abre a janela e gerencia atualizações
const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

// Inicia o Backend Unificado e importa o io (socket.io) que ele exporta
const { io } = require('./server.js'); // <-- NOVO: importa o io

let mainWindow;

// --- CONFIGURAÇÃO DO AUTO-UPDATER ---
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Evento: Quando encontra uma nova atualização
autoUpdater.on('update-available', () => {
    console.log('Nova atualização encontrada. Baixando em segundo plano...');
    io.emit('update-status', { status: 'downloading' }); // <-- NOVO
});

// Evento: Quando termina de baixar a atualização
autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualização Pronta',
        message: 'Uma nova versão do ConectaSF Bot foi baixada!',
        detail: 'O aplicativo será reiniciado agora para aplicar as melhorias.',
        buttons:['Reiniciar e Atualizar']
    }).then(() => {
        autoUpdater.quitAndInstall(false, true);
    });

    io.emit('update-status', { status: 'downloaded' }); // <-- NOVO
});

// Evento: Quando NÃO há atualizações <-- NOVO
autoUpdater.on('update-not-available', () => {
    console.log('Nenhuma atualização disponível');
    io.emit('update-status', { status: 'latest' });
});

// Evento: Erro na busca <-- NOVO
autoUpdater.on('error', (err) => {
    console.error('Erro no Auto-Updater:', err.message);
    io.emit('update-status', { status: 'error', message: err.message });
});

// Evento: Se der algum erro (ex: sem internet), ele só ignora e o app segue normal
// (Este já existia, mas substituímos pelo listener acima; mantenha apenas um)
// O listener de erro acima substitui este, então você pode remover o antigo ou manter ambos.
// Vou deixar apenas o novo que emite para a interface.

// ------------------------------------

// Escuta o pedido vindo do server.js (via process.emit) <-- NOVO
process.on('manual-update-check', () => {
    console.log('Verificando atualizações manualmente...');
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    } else {
        console.log("Modo dev: Ignorando busca de atualização.");
        // Em ambiente de desenvolvimento, podemos simular um status ou apenas ignorar
        io.emit('update-status', { status: 'dev' }); // Opcional
    }
});

function loadAppURL(win) {
    win.loadURL('http://localhost:3000').catch(() => {
        setTimeout(() => loadAppURL(win), 1500);
    });
}

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 690,
        height: 855,
        minWidth: 600,
        minHeight: 700,
        title: "ConectaSF - Bot WhatsApp",
        autoHideMenuBar: true,
        backgroundColor: '#f3f4f6'
    });

    // Tela de carregamento nativa
    mainWindow.loadURL(`data:text/html;charset=utf-8,
        <html style="background:#f3f4f6; display:flex; align-items:center; justify-content:center; font-family:sans-serif;">
            <div style="text-align:center;">
                <h2 style="color:#333;">ConectaSF Delivery</h2>
                <p style="color:#666;">Iniciando os motores do robô...</p>
            </div>
        </html>`);

    setTimeout(() => loadAppURL(mainWindow), 2000);

    // Verificação automática ao iniciar (se estiver empacotado)
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

app.on('window-all-closed', () => {
    app.quit();
});