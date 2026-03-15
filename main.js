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

// main.js - Inicia o servidor embutido e abre a janela
const { app, BrowserWindow } = require('electron');

// A MÁGICA ACONTECE AQUI:
// O backend roda nativamente dentro do Electron. Adeus tela preta (terminal)!
require('./server.js');

let mainWindow;

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
});

// Quando clicar no X, mata tudo perfeitamente
app.on('window-all-closed', () => {
    app.quit();
});