const { app, BrowserWindow, ipcMain, screen, Menu, globalShortcut, powerMonitor } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

const DEFAULT_SERVER = "http://localhost:3000";
const IS_DEV = !app.isPackaged;

let win = null;
let currentSessionId = null;
let sessionStartMs = null;
let lockEnforcedThisRun = false;

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

function getConfigPath() {
  return path.join(
    app.getPath("userData"),
    IS_DEV ? "client_config.dev.json" : "client_config.json"
  );
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), "utf-8");
}

function getEffectiveConfig() {
  const cfg = loadConfig();
  if (IS_DEV) {
    return {
      ...cfg,
      lock_enabled: false,
    };
  }
  return cfg;
}

function ensureMachineId(cfg) {
  if (!cfg.machine_id) {
    cfg.machine_id = crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
    saveConfig(cfg);
  }
  return cfg.machine_id;
}

async function apiPost(serverBase, apiPath, bodyObj) {
  const url = serverBase.replace(/\/$/, "") + apiPath;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.detail || `HTTP ${r.status}`);
  return data;
}

async function apiGet(serverBase, apiPath) {
  const url = serverBase.replace(/\/$/, "") + apiPath;
  const r = await fetch(url);

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.detail || `HTTP ${r.status}`);
  return data;
}

function setNormalMode() {
  if (!win) return;

  const { workArea } = screen.getPrimaryDisplay();

  // si estaba minimizada, restaurar
 function setKioskMode() {
  if (!win) return;

  if (win.isMinimized()) {
    win.restore();
  }

  win.setAlwaysOnTop(true, "screen-saver");
  
}
function setMiniTimerMode() {
  if (!win) return;

  if (win.isMinimized()) {
    win.restore();
  }

  if (win.isKiosk()) win.setKiosk(false);
  if (win.isFullScreen()) win.setFullScreen(false);
  
}
  // salir de modos previos


  // devolver comportamiento normal

  win.setResizable(true);
  win.setMinimizable(true);
  win.setMaximizable(true);
  win.setClosable(true);
  win.setSkipTaskbar(false);

  // devolver tamaño grande
  win.setBounds({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
  }, true);

  win.maximize();
  win.setFullScreen(true);
  win.show();
  win.focus();
}

function setKioskMode() {
  if (!win) return;

  win.setAlwaysOnTop(true, "screen-saver");
  win.setResizable(false);
  win.setMinimizable(false);
  win.setMaximizable(false);
  win.setClosable(false);
  win.setSkipTaskbar(false);

  if (!win.isKiosk()) win.setKiosk(true);
  if (!win.isFullScreen()) win.setFullScreen(true);

  win.show();
  win.focus();
}

function setMiniTimerMode() {
  if (!win) return;

  if (win.isKiosk()) win.setKiosk(false);
  if (win.isFullScreen()) win.setFullScreen(false);

  const { workArea } = screen.getPrimaryDisplay();
  const width = 320;
  const height = 320;
  const x = workArea.x + workArea.width - width - 12;
  const y = workArea.y + 12;

  win.setAlwaysOnTop(true, "screen-saver");
  win.setResizable(false);
  win.setMinimizable(true);
  win.setMaximizable(false);
  win.setClosable(false);
  win.setSkipTaskbar(false);

  win.setBounds({ x, y, width, height }, true);
  win.show();
  win.focus();
}

function createWindow() {
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    show: true,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: "#0b1120",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.on("close", (e) => {
    if (!lockEnforcedThisRun) return;

    e.preventDefault();

    if (currentSessionId) {
      win.minimize();
      return;
    }

    win.show();
    win.focus();
  });
}

async function forceLogoutFromSystem(reason) {
  if (!currentSessionId || !sessionStartMs) return;

  try {
    const cfg = loadConfig();
    const machine_id = ensureMachineId(cfg);
    const serverBase = cfg.serverBase || DEFAULT_SERVER;

    const elapsed_seconds = Math.max(
      0,
      Math.floor((Date.now() - sessionStartMs) / 1000)
    );

    await apiPost(serverBase, "/api/client/logout", {
      machine_id,
      session_id: currentSessionId,
      reason,
      elapsed_seconds,
    });
  } catch (e) {
    console.error(`No se pudo cerrar sesión por ${reason}:`, e.message);
  } finally {
    currentSessionId = null;
    sessionStartMs = null;

    if (lockEnforcedThisRun) setKioskMode();
    else setNormalMode();

    if (win && !win.isDestroyed()) {
      win.webContents.send("system-forced-logout", { reason });
    }
  }
}

app.whenReady().then(() => {
  console.log("CONFIG PATH =", getConfigPath());
  console.log("IS_DEV =", IS_DEV);

  createWindow();

  globalShortcut.register("Control+Shift+Q", () => {
    app.quit();
  });

  const cfg = getEffectiveConfig();
  lockEnforcedThisRun = !!cfg.lock_enabled;

  if (lockEnforcedThisRun) setKioskMode();
  else setNormalMode();

  if (!IS_DEV && process.platform === "win32" && app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: !!cfg.lock_enabled,
      path: process.execPath,
    });
  }

  powerMonitor.on("suspend", () => {
    void forceLogoutFromSystem("suspend");
  });

  powerMonitor.on("lock-screen", () => {
    void forceLogoutFromSystem("lock-screen");
  });

  powerMonitor.on("resume", () => {
    if (lockEnforcedThisRun) setKioskMode();
    else setNormalMode();
  });

  ipcMain.handle("client:getInfo", async () => {
    const rawCfg = loadConfig();
    const cfg = getEffectiveConfig();
    const machine_id = ensureMachineId(rawCfg);

    return {
      machine_id,
      hostname: os.hostname(),
      ip: getLocalIPv4(),
      serverBase: rawCfg.serverBase || DEFAULT_SERVER,
      paired_confirmed: !!rawCfg.paired_confirmed,
      last_known_status: rawCfg.last_known_status || null,
      lock_enabled: !!cfg.lock_enabled,
      is_dev: IS_DEV,
    };
  });

  ipcMain.handle("client:setServer", async (_e, serverBase) => {
    const cfg = loadConfig();
    cfg.serverBase = serverBase;
    saveConfig(cfg);
    return { ok: true };
  });

  ipcMain.handle("client:status", async () => {
    const cfg = loadConfig();
    const machine_id = ensureMachineId(cfg);
    const serverBase = cfg.serverBase || DEFAULT_SERVER;

    const st = await apiGet(
      serverBase,
      `/api/client/status?machine_id=${encodeURIComponent(machine_id)}`
    );

    cfg.last_known_status = st.status || null;
    cfg.paired_confirmed = st.status === "VINCULADA";
    cfg.last_status_check_at = new Date().toISOString();
    saveConfig(cfg);

    return st;
  });

  ipcMain.handle("client:pairRequest", async () => {
    const cfg = loadConfig();
    const machine_id = ensureMachineId(cfg);
    const serverBase = cfg.serverBase || DEFAULT_SERVER;

    return await apiPost(serverBase, "/api/client/pair/request", {
      machine_id,
      hostname: os.hostname(),
      ip: getLocalIPv4(),
    });
  });

  ipcMain.handle("client:login", async (_e, { codigo, password }) => {
    const cfg = loadConfig();
    const machine_id = ensureMachineId(cfg);
    const serverBase = cfg.serverBase || DEFAULT_SERVER;

    const data = await apiPost(serverBase, "/api/client/login", {
      machine_id,
      codigo,
      password,
      hostname: os.hostname(),
      ip: getLocalIPv4(),
    });

    currentSessionId = data.session_id;
    sessionStartMs = Date.now();

    return data;
  });

  ipcMain.handle("window:enterSessionMode", async () => {
    setMiniTimerMode();
    return { ok: true };
  });

  ipcMain.handle("window:leaveSessionMode", async () => {
    if (lockEnforcedThisRun) setKioskMode();
    else setNormalMode();
    return { ok: true };
  });

  ipcMain.handle("client:heartbeat", async () => {
    if (!currentSessionId || !sessionStartMs) {
      return { ok: false };
    }

    const cfg = loadConfig();
    const machine_id = ensureMachineId(cfg);
    const serverBase = cfg.serverBase || DEFAULT_SERVER;

    const elapsed_seconds = Math.max(
      0,
      Math.floor((Date.now() - sessionStartMs) / 1000)
    );

    return await apiPost(serverBase, "/api/client/heartbeat", {
      machine_id,
      session_id: currentSessionId,
      elapsed_seconds,
      hostname: os.hostname(),
      ip: getLocalIPv4(),
    });
  });

 ipcMain.handle("client:logout", async (_e, reason = "logout") => {
  const cfg = loadConfig();

  if (!currentSessionId) {
    return { ok: true, closed: false };
  }

  const machine_id = ensureMachineId(cfg);
  const serverBase = cfg.serverBase || DEFAULT_SERVER;

  const elapsed_seconds = Math.max(
    0,
    Math.floor((Date.now() - sessionStartMs) / 1000)
  );

  const out = await apiPost(serverBase, "/api/client/logout", {
    machine_id,
    session_id: currentSessionId,
    reason,
    elapsed_seconds,
  });

  currentSessionId = null;
  sessionStartMs = null;

  return out;
});

  ipcMain.handle("client:getLockStatus", async () => {
    const cfg = getEffectiveConfig();
    return {
      lock_enabled: !!cfg.lock_enabled,
      lock_active_now: !!lockEnforcedThisRun,
      is_dev: IS_DEV,
    };
  });

  ipcMain.handle("client:enableLock", async () => {
    if (IS_DEV) {
      return {
        ok: true,
        applied_now: false,
        message: "En desarrollo no se activa el modo biblioteca.",
      };
    }

    const cfg = loadConfig();
    cfg.lock_enabled = true;
    saveConfig(cfg);

    if (process.platform === "win32" && app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
      });
    }

    return {
      ok: true,
      applied_now: false,
      message: "Modo biblioteca guardado. Se aplicará al reiniciar.",
    };
  });

  ipcMain.handle("client:disableLock", async () => {
    const cfg = loadConfig();
    cfg.lock_enabled = false;
    saveConfig(cfg);

    if (!IS_DEV && process.platform === "win32" && app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: false,
        path: process.execPath,
      });
    }

    lockEnforcedThisRun = false;
    setNormalMode();

    return { ok: true };
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
