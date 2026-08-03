import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { sendAlert } from "./mailer.js";

const STATE_FILE = process.env.STATE_FILE || "data/state.json";

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function servicesFromEnv() {
  const raw = process.env.PM2_SERVICES || "mecopia-back,mecopia-web,mecopia-web-admin";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parsePm2List(jsonText) {
  const list = JSON.parse(jsonText);
  if (!Array.isArray(list)) {
    throw new Error("La salida de pm2 jlist no es un array");
  }
  return list;
}

function getServiceStatus(list, name) {
  const proc = list.find((p) => p.name === name);
  if (!proc) return { found: false, status: "missing" };
  return {
    found: true,
    status: proc.pm2_env?.status || proc.status || "unknown",
    uptime: proc.pm2_env?.pm_uptime || null,
    restarts: proc.pm2_env?.restart_time ?? null,
  };
}

function isOnline(statusInfo) {
  return statusInfo.found && String(statusInfo.status).toLowerCase() === "online";
}

function formatDate() {
  return new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
}

function buildSubject(down) {
  const names = down.map((d) => d.name).join(", ");
  return `[Mecopia Watchdog] Servicio caído: ${names}`;
}

function buildBody(down, host) {
  const lines = down.map((d) => {
    const st = d.status;
    const restarts = d.restarts !== null ? ` (reinicios: ${d.restarts})` : "";
    return `- ${d.name}: ${st}${restarts}`;
  });

  const text = [
    `Fecha: ${formatDate()}`,
    `Servidor: ${host}`,
    "",
    "Los siguientes servicios no están online:",
    ...lines,
    "",
    "Revisa el servidor con: pm2 status && pm2 logs",
  ].join("\n");

  const html = `<p><strong>Fecha:</strong> ${formatDate()}<br>`
    + `<strong>Servidor:</strong> ${host}</p>`
    + "<p>Los siguientes servicios no están online:</p>"
    + "<ul>"
    + down.map((d) => `<li><code>${d.name}</code>: ${d.status}${d.restarts !== null ? ` (reinicios: ${d.restarts})` : ""}</li>`).join("")
    + "</ul>"
    + "<p>Revisa el servidor con: <code>pm2 status && pm2 logs</code></p>";

  return { text, html };
}

function buildRecoverySubject(recovered) {
  return `[Mecopia Watchdog] Recuperado: ${recovered.join(", ")}`;
}

function buildRecoveryBody(recovered, host) {
  const text = [
    `Fecha: ${formatDate()}`,
    `Servidor: ${host}`,
    "",
    "Los siguientes servicios se han recuperado:",
    ...recovered.map((r) => `- ${r}`),
  ].join("\n");

  const html = `<p><strong>Fecha:</strong> ${formatDate()}<br>`
    + `<strong>Servidor:</strong> ${host}</p>`
    + "<p>Los siguientes servicios se han recuperado:</p>"
    + "<ul>"
    + recovered.map((r) => `<li><code>${r}</code></li>`).join("")
    + "</ul>";

  return { text, html };
}

export async function evaluateAndAlert(listText) {
  const list = parsePm2List(listText);
  const services = servicesFromEnv();
  const host = process.env.SSH_HOST || os.hostname();

  const statusByService = {};
  for (const name of services) {
    statusByService[name] = getServiceStatus(list, name);
  }

  const now = Date.now();
  const alertInterval = parseInt(process.env.ALERT_INTERVAL_MS || "300000", 10);

  const state = await loadState();
  const downNow = [];
  const recovered = [];

  for (const name of services) {
    const info = statusByService[name];
    const wasDown = state[name]?.down || false;
    const currentlyDown = !isOnline(info);

    if (currentlyDown) {
      const lastAlert = state[name]?.lastAlert || 0;
      const shouldAlert = !wasDown || now - lastAlert >= alertInterval;
      downNow.push({ name, ...info, shouldAlert });
    } else if (wasDown) {
      recovered.push(name);
    }

    state[name] = {
      down: currentlyDown,
      status: info.status,
      lastAlert: currentlyDown && downNow.find((d) => d.name === name)?.shouldAlert ? now : (state[name]?.lastAlert || 0),
      lastCheck: now,
    };
  }

  const alerts = [];

  if (downNow.length > 0) {
    const toAlert = downNow.filter((d) => d.shouldAlert);
    if (toAlert.length > 0) {
      const { text, html } = buildBody(toAlert, host);
      alerts.push(sendAlert(buildSubject(toAlert), text, html));
      for (const d of toAlert) {
        state[d.name].lastAlert = now;
      }
    }
  }

  if (recovered.length > 0) {
    const { text, html } = buildRecoveryBody(recovered, host);
    alerts.push(sendAlert(buildRecoverySubject(recovered), text, html));
  }

  await saveState(state);
  return { downNow, recovered, alertsSent: alerts.length };
}
