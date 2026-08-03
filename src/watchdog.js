import dotenv from "dotenv";
import { spawn } from "child_process";
import { evaluateAndAlert } from "./check.js";

dotenv.config();

const CHECK_MODE = process.env.CHECK_MODE || "local";
const SSH_HOST = process.env.SSH_HOST || "mecopia-admin-server";
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS || "60000", 10);

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Comando falló con código ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function fetchPm2List() {
  if (CHECK_MODE === "ssh") {
    return runCommand("ssh", [SSH_HOST, "pm2", "jlist"]);
  }
  return runCommand("pm2", ["jlist"]);
}

async function checkOnce() {
  const label = `[${new Date().toISOString()}]`;
  try {
    const listText = await fetchPm2List();
    const result = await evaluateAndAlert(listText);
    const downNames = result.downNow.map((d) => `${d.name}(${d.status})`).join(", ");
    console.log(`${label} OK. Caídos: ${downNames || "ninguno"}. Recuperados: ${result.recovered.join(", ") || "ninguno"}. Alertas enviadas: ${result.alertsSent}`);
  } catch (err) {
    console.error(`${label} ERROR: ${err.message}`);
    // Si no podemos ni obtener el estado, es una falla grave. Se podría alertar,
    // pero sin saber qué ha pasado se arriesga a spam. Se deja log.
  }
}

async function main() {
  console.log(`[watchdog] Modo=${CHECK_MODE}, host=${CHECK_MODE === "ssh" ? SSH_HOST : "local"}, intervalo=${CHECK_INTERVAL}ms`);

  // Ejecutar una primera vez para validar configuración
  await checkOnce();

  if (process.argv.includes("--once")) {
    process.exit(0);
  }

  setInterval(checkOnce, CHECK_INTERVAL);
}

main().catch((err) => {
  console.error("[watchdog] Error fatal:", err);
  process.exit(1);
});
