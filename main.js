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

// Inicia o Backend Unificado
require('./server.js');

let mainWindow;

// --- CONFIGURAÇÃO DO AUTO-UPDATER ---
autoUpdater.autoDownload = true; // Baixa a atualização em segundo plano sozinho
autoUpdater.autoInstallOnAppQuit = true; // Instala quando o app for fechado (se o usuário ignorar o aviso)

// Evento: Quando encontra uma nova atualização
autoUpdater.on('update-available', () => {
    console.log('Nova atualização encontrada. Baixando em segundo plano...');
});

// Evento: Quando termina de baixar a atualização
autoUpdater.on('update-downloaded', () => {
    // Exibe um pop-up nativo do Windows avisando o cliente
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualização Pronta',
        message: 'Uma nova versão do ConectaSF Bot foi baixada!',
        detail: 'O aplicativo será reiniciado agora para aplicar as melhorias.',
        buttons:['Reiniciar e Atualizar']
    }).then(() => {
        // Fecha o app e instala a nova versão
        autoUpdater.quitAndInstall(false, true);
    });
});

// Evento: Se der algum erro (ex: sem internet), ele só ignora e o app segue normal
autoUpdater.on('error', (err) => {
    console.error('Erro no Auto-Updater:', err.message);
});
// ------------------------------------

function loadAppURL(win) {
    win.loadURL('http://localhost:3000').catch(() => {
        setTimeout(() => loadAppURL(win), 1500); // Tenta de novo se não subiu ainda
    });
}

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 850,
        height: 700,
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

    // Assim que a janela estiver pronta, manda checar atualizações no GitHub
    // (Isso só vai funcionar na versão empacotada .exe, no 'npm start' em dev ele ignora)
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

// Quando clicar no X, mata tudo perfeitamente
app.on('window-all-closed', () => {
    app.quit();
});