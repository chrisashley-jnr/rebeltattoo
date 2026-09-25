import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_AGE_MS = 5 * 60 * 1000;

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(status).json(body);
}

function validMessage(message) {
  return message
    && typeof message.id === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(message.id)
    && typeof message.to === "string" && EMAIL_PATTERN.test(message.to) && message.to.length <= 254
    && typeof message.replyTo === "string" && (!message.replyTo || (EMAIL_PATTERN.test(message.replyTo) && message.replyTo.length <= 254))
    && typeof message.subject === "string" && message.subject.length > 0 && message.subject.length <= 180
    && !/[\r\n\0]/.test(message.subject)
    && typeof message.text === "string" && message.text.length > 0 && message.text.length <= 12000
    && typeof message.html === "string" && message.html.length <= 60000;
}

export function verifyRelayEnvelope(envelope, secret, nowMs = Date.now()) {
  if (!envelope || typeof envelope !== "object"
    || typeof envelope.timestamp !== "string" || !/^\d{13}$/.test(envelope.timestamp)
    || Math.abs(nowMs - Number(envelope.timestamp)) > MAX_AGE_MS
    || typeof envelope.payload !== "string" || envelope.payload.length > 80000
    || typeof envelope.signature !== "string" || !/^[a-f0-9]{64}$/.test(envelope.signature)
    || typeof secret !== "string" || secret.length < 32) return null;

  const expected = createHmac("sha256", secret)
    .update(`${envelope.timestamp}.${envelope.payload}`, "utf8")
    .digest();
  const supplied = Buffer.from(envelope.signature, "hex");
  if (!timingSafeEqual(expected, supplied)) return null;

  try {
    const message = JSON.parse(envelope.payload);
    return validMessage(message) ? message : null;
  } catch {
    return null;
  }
}

export function createEmailRelay(sendMail = async (options, env) => {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport.sendMail(options);
}, env = process.env) {
  return async function handler(request, response) {
    if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
    if (!env.EMAIL_RELAY_SECRET || !env.SMTP_USER || !env.SMTP_PASS) {
      return json(response, 503, { error: "Email relay is not configured." });
    }
    if (Number(request.headers?.["content-length"] || 0) > 100_000) {
      return json(response, 413, { error: "Request is too large." });
    }
    let envelope;
    try {
      envelope = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    } catch {
      return json(response, 400, { error: "Invalid JSON." });
    }
    const message = verifyRelayEnvelope(envelope, env.EMAIL_RELAY_SECRET);
    if (!message) return json(response, 401, { error: "Invalid email relay request." });

    try {
      const sent = await sendMail({
        from: `Rebel Tattoos <${env.SMTP_USER}>`,
        to: message.to,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }, env);
      return json(response, 200, { id: sent.messageId || message.id });
    } catch (error) {
      console.error("Email relay failed", error);
      return json(response, 502, { error: "Gmail could not send this message." });
    }
  };
}

export default createEmailRelay();
