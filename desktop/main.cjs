// SAFE - application de bureau Windows (Electron) : lance le serveur partagé en local et ouvre la fenêtre.
const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const PORT = Number(process.env.SAFE_PORT ?? 5300);
let server;
let win;

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get({ host: "127.0.0.1", port: PORT, path: "/api/health", timeout: 800 }, (res) => { res.resume(); resolve(); });
      req.on("error", () => (left > 0 ? setTimeout(() => attempt(left - 1), 500) : reject(new Error("Serveur SAFE injoignable"))));
      req.on("timeout", () => req.destroy());
    };
    attempt(retries);
  });
}

function startServer() {
  const appDir = app.getAppPath();
  const dataDir = path.join(app.getPath("userData"), "donnees");
  server = spawn(process.execPath, [path.join(appDir, "scripts", "share-server.mjs"), String(PORT), dataDir], {
    cwd: appDir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  server.on("exit", () => { server = undefined; });
}

async function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1024, minHeight: 640, title: "SAFE", backgroundColor: "#0b1220", autoHideMenuBar: true });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  try {
    await waitForServer();
    await win.loadURL(`http://127.0.0.1:${PORT}/`);
  } catch (error) {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="font-family:sans-serif;padding:40px"><h2>SAFE</h2><p>Le serveur local n'a pas démarré : ${String(error.message)}</p></body>`));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { startServer(); void createWindow(); });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => { try { server?.kill(); } catch { /* */ } });
}
