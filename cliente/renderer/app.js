const viewPair = document.getElementById("view-pair");
const viewLogin = document.getElementById("view-login");
const viewSession = document.getElementById("view-session");

const pairCodeEl = document.getElementById("pairCode");
const pairInfoEl = document.getElementById("pairInfo");
const pairErr = document.getElementById("pairErr");
const btnGoLogin = document.getElementById("btnGoLogin");

const loginErr = document.getElementById("loginErr");
const sesErr = document.getElementById("sesErr");

const sesUser = document.getElementById("sesUser");
const sesPc = document.getElementById("sesPc");
const timerEl = document.getElementById("timer");
const hbStatus = document.getElementById("hbStatus");

const btnPair = document.getElementById("btnPair");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const btnGuardarServidor = document.getElementById("btnGuardarServidor");
const btnEnableLock = document.getElementById("btnEnableLock");

let hbInterval = null;
let timerInterval = null;
let timerStart = null;
let isLoggingIn = false;
let isLoggingOut = false;

function updateLayoutMode() {
  const isSessionVisible =
    viewSession && !viewSession.classList.contains("hidden");

  const isPairVisible =
    viewPair && !viewPair.classList.contains("hidden");

  document.body.classList.toggle("session-active", isSessionVisible);
  document.body.classList.toggle("pair-only", isPairVisible && !isSessionVisible);
}

function focusLoginInput() {
  const codigo = document.getElementById("codigo");
  if (codigo && !viewLogin.classList.contains("hidden")) {
    setTimeout(() => codigo.focus(), 50);
  }
}

function show(which) {
  viewPair.classList.add("hidden");
  viewLogin.classList.add("hidden");
  viewSession.classList.add("hidden");

  which.classList.remove("hidden");
  updateLayoutMode();

  if (which === viewLogin) {
    focusLoginInput();
  }
}

function fmt(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function startTimer() {
  stopTimer();
  timerStart = Date.now();
  timerEl.textContent = "00:00:00";

  timerInterval = setInterval(() => {
    const sec = Math.max(0, Math.floor((Date.now() - timerStart) / 1000));
    timerEl.textContent = fmt(sec);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerStart = null;
  timerEl.textContent = "00:00:00";
}

async function sendHeartbeatOnce() {
  try {
    const r = await window.api.heartbeat();
    if (r && r.ok === false) {
      hbStatus.textContent = "Heartbeat: sin sesión";
      return;
    }
    hbStatus.textContent = "Heartbeat: OK";
  } catch (e) {
    hbStatus.textContent = "Heartbeat: ERROR";
  }
}

function startHeartbeat() {
  stopHeartbeat();
  hbStatus.textContent = "Heartbeat: enviando...";
  void sendHeartbeatOnce();

  hbInterval = setInterval(() => {
    void sendHeartbeatOnce();
  }, 15000);
}

function stopHeartbeat() {
  if (hbInterval) clearInterval(hbInterval);
  hbInterval = null;
  hbStatus.textContent = "Heartbeat: —";
}

function withTimeout(promise, ms = 2500) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Tiempo de espera agotado")), ms)
    ),
  ]);
}

if (window.systemEvents?.onForcedLogout) {
  window.systemEvents.onForcedLogout(({ reason }) => {
    stopHeartbeat();
    stopTimer();
    sesErr.textContent = `La sesión se cerró automáticamente por: ${reason}`;
    show(viewLogin);
  });
}

if (btnPair) {
  btnPair.addEventListener("click", async () => {
    pairErr.textContent = "";
    pairInfoEl.textContent = "";
    pairCodeEl.textContent = "…";

    if (btnGoLogin) btnGoLogin.disabled = true;
    btnPair.disabled = true;

    try {
      const r = await window.api.pairRequest();
      pairCodeEl.textContent = r.pair_code;
      pairInfoEl.textContent = `Expira: ${new Date(r.expira_en).toLocaleString()} (reused=${r.reused})`;

      if (btnGoLogin) btnGoLogin.disabled = false;
    } catch (e) {
      pairCodeEl.textContent = "—";
      pairErr.textContent = e.message || "Error";
    } finally {
      btnPair.disabled = false;
    }
  });
}

if (btnGoLogin) {
  btnGoLogin.addEventListener("click", () => {
    loginErr.textContent = "";
    show(viewLogin);
  });
}

if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    if (isLoggingIn) return;

    loginErr.textContent = "";
    sesErr.textContent = "";

    const codigo = document.getElementById("codigo").value.trim();
    const password = document.getElementById("password").value;

    if (!codigo || !password) {
      loginErr.textContent = "Ingrese usuario y contraseña";
      return;
    }

    isLoggingIn = true;
    btnLogin.disabled = true;

    try {
      const data = await window.api.login(codigo, password);

      if (!data?.usuario || !data?.pc) {
        throw new Error("Respuesta inválida del servidor en login");
      }

      sesUser.textContent = `${data.usuario.codigo} - ${data.usuario.nombre}`;
      sesPc.textContent = data.pc.nombre_visible || "PC";

      show(viewSession);
      startTimer();
      startHeartbeat();

      await new Promise((resolve) => setTimeout(resolve, 120));
      await window.api.enterSessionMode();
    } catch (e) {
      loginErr.textContent = e.message || "No se pudo iniciar sesión";
    } finally {
      isLoggingIn = false;
      btnLogin.disabled = false;
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    if (isLoggingOut) return;

    isLoggingOut = true;
    btnLogout.disabled = true;
    sesErr.textContent = "";

    try {
      stopHeartbeat();
      stopTimer();

      await window.api.logout("logout");
      await window.api.leaveSessionMode();

      await new Promise((resolve) => setTimeout(resolve, 120));

      show(viewLogin);
    } catch (e) {
      sesErr.textContent = e.message || "No se pudo cerrar";
    } finally {
      isLoggingOut = false;
      btnLogout.disabled = false;
    }
  });
}

if (btnGuardarServidor) {
  btnGuardarServidor.addEventListener("click", async () => {
    const url = document.getElementById("serverUrl").value.trim();

    try {
      await window.api.setServer(url);
      document.getElementById("serverInfo").textContent = "Servidor guardado ✅";
    } catch (e) {
      pairErr.textContent = e.message || "No se pudo guardar el servidor";
    }
  });
}

if (btnEnableLock) {
  btnEnableLock.addEventListener("click", async () => {
    try {
      const r = await window.api.enableLock();
      document.getElementById("lockInfo").textContent =
        r.message || "Modo biblioteca guardado. Se aplicará al reiniciar.";
    } catch (e) {
      pairErr.textContent = e.message || "No se pudo activar el modo biblioteca";
    }
  });
}

(async () => {
  try {
    const st = await window.api.getLockStatus();
    const lockInfo = document.getElementById("lockInfo");
    if (lockInfo) {
      if (st.is_dev) {
        lockInfo.textContent = "Modo biblioteca desactivado en desarrollo.";
      } else if (st.lock_active_now) {
        lockInfo.textContent = "Modo biblioteca: ACTIVO en esta ejecución ✅";
      } else if (st.lock_enabled) {
        lockInfo.textContent = "Modo biblioteca configurado. Se aplicará al reiniciar.";
      } else {
        lockInfo.textContent = "Modo biblioteca: desactivado (configuración)";
      }
    }
  } catch {}
})();

(async () => {
  try {
    const info = await window.api.getInfo();

    const serverUrl = document.getElementById("serverUrl");
    const serverInfo = document.getElementById("serverInfo");

    if (serverUrl) serverUrl.value = info.serverBase || "";
    if (serverInfo) serverInfo.textContent = `machine_id: ${info.machine_id || ""}`;

    const hasMachine = !!info.machine_id;
    const hasServer = !!info.serverBase;
    const pairedCached = !!info.paired_confirmed;

    if (hasMachine && hasServer && pairedCached) {
      show(viewLogin);
    } else {
      show(viewPair);
      pairInfoEl.textContent = "Verificando estado del equipo...";
    }

    try {
      const st = await withTimeout(window.api.status(), 2000);
      console.log("STATUS RECIBIDO:", st);

      if (st.status === "VINCULADA") {
        pairInfoEl.textContent = "";
        show(viewLogin);
      } else {
        pairInfoEl.textContent = "Equipo no vinculado todavía.";
        show(viewPair);
      }
    } catch (e) {
      console.warn("No se pudo validar status en segundo plano:", e.message);

      if (!pairedCached) {
        pairErr.textContent = "No se pudo verificar si el equipo está vinculado.";
        show(viewPair);
      }
    }
  } catch (e) {
    console.error("Error cargando configuración local:", e);
    pairErr.textContent = "No se pudo cargar la configuración local.";
    show(viewPair);
  }
})();
