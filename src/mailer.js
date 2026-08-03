import dotenv from "dotenv";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const nodemailer = require("nodemailer");

dotenv.config();

let transporter;

try {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.MAIL_USER,
      clientId: process.env.MAIL_CLIENT_ID,
      clientSecret: process.env.MAIL_CLIENT_SECRET,
      refreshToken: process.env.MAIL_REFRESH_TOKEN,
    },
  });
} catch (error) {
  console.error("[mailer] Error creando transporter:", error.message);
  transporter = undefined;
}

export async function sendAlert(subject, text, html) {
  const fromName = process.env.MAIL_FROM_NAME || "Mecopia Watchdog";
  const from = `"${fromName}" <${process.env.MAIL_USER}>`;
  const to = process.env.ALERT_TO;

  if (process.env.DRY_RUN === "true") {
    console.log(`[mailer] DRY_RUN: no se envía correo${to ? " a " + to : ""}`);
    console.log(`[mailer] Asunto: ${subject}`);
    return { dryRun: true };
  }

  if (!to) {
    throw new Error("ALERT_TO no está configurado.");
  }

  if (!transporter) {
    throw new Error("Transporter de correo no inicializado. Revisa MAIL_USER, MAIL_CLIENT_ID, MAIL_CLIENT_SECRET y MAIL_REFRESH_TOKEN.");
  }

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  console.log(`[mailer] Correo enviado: ${info.messageId}`);
  return info;
}
