// Vercel serverless function: POST /api/bookings
// Validates form, generates a booking reference, and delivers emails via Gmail SMTP.
// No database — all booking details are captured in the email.
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import tls from "node:tls";

// ── helpers ─────────────────────────────────────────────────────────────────

function cleanLine(value, max = 180) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function generateReference() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RT-${date}-${rand}`;
}

// ── SMTP client (Node.js TLS) ────────────────────────────────────────────────

async function openTls({ host, port }) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const socket = tls.connect(port, host, { servername: host }, () => {
      resolved = true;
      let readBuf = "";
      const waiters = [];
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        readBuf += chunk;
        while (readBuf.includes("\r\n") && waiters.length > 0) {
          const idx = readBuf.indexOf("\r\n");
          const line = readBuf.slice(0, idx);
          readBuf = readBuf.slice(idx + 2);
          waiters.shift().resolve(line);
        }
      });
      socket.on("error", (err) => { waiters.forEach((w) => w.reject(err)); });
      socket.on("close", () => { waiters.forEach((w) => w.reject(new Error("Socket closed."))); });
      resolve({
        async write(data) {
          return new Promise((res, rej) => socket.write(data, (e) => (e ? rej(e) : res())));
        },
        async readLine() {
          const idx = readBuf.indexOf("\r\n");
          if (idx !== -1) { const l = readBuf.slice(0, idx); readBuf = readBuf.slice(idx + 2); return l; }
          return new Promise((res, rej) => waiters.push({ resolve: res, reject: rej }));
        },
        async close() { socket.end(); },
      });
    });
    socket.on("error", (err) => { if (!resolved) reject(err); });
  });
}

async function smtpReply(transport) {
  const lines = [];
  while (true) {
    const line = await transport.readLine();
    lines.push(line);
    if (line.charAt(3) !== "-") break;
  }
  const last = lines[lines.length - 1] || "";
  return { code: parseInt(last.slice(0, 3), 10), last };
}

async function sendSmtpEmail({ host, port, user, pass, from, to, replyTo, subject, text, html }) {
  const cleanPass = String(pass || "").replace(/\s+/g, "");
  const authPlain = Buffer.from(`\0${user}\0${cleanPass}`).toString("base64");
  const fromAddr = (from.match(/<([^<>]+)>/) || [])[1] || from;
  const toAddr = (to.match(/<([^<>]+)>/) || [])[1] || to;
  const transport = await openTls({ host: host || "smtp.gmail.com", port: port || 465 });

  try {
    let r = await smtpReply(transport);
    if (r.code !== 220) throw new Error(`Greeting: ${r.last}`);
    await transport.write("EHLO localhost\r\n");
    r = await smtpReply(transport);
    if (r.code !== 250) throw new Error(`EHLO: ${r.last}`);
    await transport.write(`AUTH PLAIN ${authPlain}\r\n`);
    r = await smtpReply(transport);
    if (r.code !== 235) throw new Error(`Auth failed (${r.code}): ${r.last}`);
    await transport.write(`MAIL FROM:<${fromAddr}>\r\n`);
    r = await smtpReply(transport);
    if (r.code !== 250) throw new Error(`MAIL FROM: ${r.last}`);
    await transport.write(`RCPT TO:<${toAddr}>\r\n`);
    r = await smtpReply(transport);
    if (r.code !== 250) throw new Error(`RCPT TO: ${r.last}`);
    await transport.write("DATA\r\n");
    r = await smtpReply(transport);
    if (r.code !== 354) throw new Error(`DATA: ${r.last}`);

    const boundary = `----=_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const escapeDots = (s) => String(s || "").replace(/\r?\n\./g, "\r\n..");
    const headers = [
      `From: ${from}`, `To: ${to}`,
      ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@rebeltattoos>`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join("\r\n");

    const body = [
      headers, "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit", "",
      escapeDots(text || ""), "",
      ...(html ? [
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit", "",
        escapeDots(html), "",
      ] : []),
      `--${boundary}--`, "",
    ].join("\r\n");

    await transport.write(body + ".\r\n");
    r = await smtpReply(transport);
    if (r.code !== 250) throw new Error(`Message rejected: ${r.last}`);
    await transport.write("QUIT\r\n");
    try { await smtpReply(transport); } catch {}
    return { ok: true };
  } finally {
    await transport.close();
  }
}

// ── email templates (inline for Vercel function) ─────────────────────────────

const palette = {
  paper: "#f3eee6", surface: "#e8e0d6", ink: "#171319", muted: "#625b62",
  border: "#87757f", cobalt: "#4b2a50", cobaltDark: "#321a38",
  cobaltSoft: "#e5d9e6", orange: "#741f3a", inverse: "#fffaf3",
  inverseMuted: "#c8bbc2",
};

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return String(value || "To be confirmed");
  return new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function detailRow(label, val, final = false) {
  return `<tr><td style="padding:12px 0;${final ? "" : `border-bottom:1px solid ${palette.border};`}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="34%" valign="top" style="padding:0 16px 0 0;color:${palette.muted};font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;">${escapeHtml(label)}</td><td valign="top" style="color:${palette.ink};font-family:Arial,sans-serif;font-size:14px;font-weight:600;line-height:21px;">${escapeHtml(val || "—")}</td></tr></table></td></tr>`;
}

function emailFrame({ preheader, title, intro, content, footerNote }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${palette.surface};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.surface}" style="width:100%;background:${palette.surface};">
<tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.paper}" style="max-width:640px;width:100%;border:1px solid ${palette.border};border-radius:16px;overflow:hidden;background:${palette.paper};">
<tr><td style="height:8px;background:${palette.cobalt};font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 34px 24px;border-bottom:1px solid ${palette.border};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="color:${palette.ink};font-family:Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:1.5px;">REBEL TATTOOS</td>
    <td align="right"><span style="display:inline-block;width:28px;height:5px;border-radius:3px;background:${palette.orange};font-size:0;">&nbsp;</span></td>
  </tr></table>
</td></tr>
<tr><td style="padding:38px 34px 36px;">
  <h1 style="margin:0;color:${palette.ink};font-family:Arial Narrow,Arial,sans-serif;font-size:44px;font-weight:800;text-transform:uppercase;">${escapeHtml(title)}</h1>
  <p style="margin:18px 0 0;color:${palette.muted};font-family:Arial,sans-serif;font-size:16px;line-height:25px;">${intro}</p>
  ${content}
</td></tr>
<tr><td style="padding:24px 34px;border-top:1px solid ${palette.border};background:${palette.ink};">
  <p style="margin:0;color:${palette.inverse};font-family:Arial,sans-serif;font-size:13px;font-weight:700;">Fine-line tattooing with softness, movement, and meaning.</p>
  <p style="margin:7px 0 0;color:${palette.inverseMuted};font-family:Arial,sans-serif;font-size:12px;line-height:18px;">${escapeHtml(footerNote)}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function renderConfirmationEmail(booking) {
  const content = `
    <div style="margin:26px 0 0;padding:14px 16px;border:1px solid ${palette.border};border-radius:10px;background:${palette.cobaltSoft};">
      <p style="margin:0;color:${palette.cobaltDark};font-family:Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Booking reference</p>
      <p style="margin:3px 0 0;color:${palette.ink};font-family:Arial,sans-serif;font-size:16px;font-weight:800;">${escapeHtml(booking.reference)}</p>
    </div>
    <p style="margin:28px 0 0;color:${palette.ink};font-family:Arial,sans-serif;font-size:15px;line-height:24px;">Hi ${escapeHtml(booking.fullName)},</p>
    <p style="margin:10px 0 0;color:${palette.muted};font-family:Arial,sans-serif;font-size:15px;line-height:24px;">Thanks for sharing your idea. Michelle will review the request and reply within 2–3 business days.</p>
    <div style="margin:28px 0 0;padding:20px;border:1px solid ${palette.border};border-radius:16px;background:${palette.surface};">
      <p style="margin:0 0 8px;color:${palette.ink};font-family:Arial,sans-serif;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;">Your request</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("Idea", String(booking.tattooIdea || "").slice(0, 320))}
        ${detailRow("Placement", booking.placement)}
        ${detailRow("Size", booking.size)}
        ${detailRow("Style", booking.style)}
        ${detailRow("Preferred date", formatDate(booking.preferredDate), true)}
      </table>
    </div>
    <div style="margin:28px 0 0;padding:16px;border:1px solid ${palette.border};border-radius:10px;background:${palette.paper};">
      <p style="margin:0;color:${palette.muted};font-family:Arial,sans-serif;font-size:13px;line-height:20px;"><strong style="color:${palette.ink};">A quick note:</strong> this request starts the conversation; it does not confirm an appointment yet.</p>
    </div>`;
  return emailFrame({
    preheader: `We received your Rebel Tattoos request ${booking.reference}.`,
    title: "Your idea is in.",
    intro: "Your booking request reached Michelle safely. Keep this email for your reference.",
    content,
    footerNote: "Reply to this email if you need to add a small detail before your request is reviewed.",
  });
}

function renderAdminEmail(booking, adminUrl) {
  const content = `
    <div style="margin:26px 0 0;padding:20px;border:1px solid ${palette.border};border-radius:16px;background:${palette.surface};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("Reference", booking.reference)}
        ${detailRow("Booker", booking.fullName)}
        ${detailRow("Email", booking.email)}
        ${detailRow("Phone", booking.phone || "—")}
        ${detailRow("Idea", String(booking.tattooIdea || "").slice(0, 320))}
        ${detailRow("Placement", booking.placement)}
        ${detailRow("Size", booking.size)}
        ${detailRow("Style", booking.style)}
        ${detailRow("Ink", booking.ink)}
        ${detailRow("Budget", booking.budget)}
        ${detailRow("Preferred date", formatDate(booking.preferredDate))}
        ${detailRow("Details", String(booking.details || "—").slice(0, 1000), true)}
      </table>
    </div>
    ${adminUrl ? `<p style="margin:18px 0 0;"><a href="${escapeHtml(adminUrl)}" style="color:${palette.cobalt};">Open in admin dashboard →</a></p>` : ""}`;
  return emailFrame({
    preheader: `New booking ${booking.reference} from ${booking.fullName}.`,
    title: "New booking request.",
    intro: "A new home service request is ready for review.",
    content,
    footerNote: "Private booking notification.",
  });
}

// ── main handler ─────────────────────────────────────────────────────────────

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  // Parse multipart form data
  let formData;
  try {
    const boundary = req.headers["content-type"]?.match(/boundary=([^\s;]+)/)?.[1];
    if (!boundary) throw new Error("No multipart boundary found.");
    formData = await parseMultipart(req, boundary);
  } catch (err) {
    return res.status(400).json({ error: "Could not read form data." });
  }

  const get = (name) => cleanLine(formData[name]?.[0]?.value || "", 2000);

  // Honeypot
  if (get("website")) {
    return res.status(201).json({ booking: { reference: "RT-HONEYPOT" }, notifications: "none" });
  }

  // Validate required fields
  const errors = {};
  const fullName = get("fullName").trim();
  const email = get("email").trim().toLowerCase();
  const tattooIdea = get("tattooIdea").trim();
  const placement = get("placement").trim();
  const size = get("size").trim();
  const preferredDate = get("preferredDate").trim();
  const ageConfirmed = get("ageConfirmed") === "true";

  if (fullName.length < 2) errors.fullName = "Enter the name you use for bookings.";
  if (!validEmail(email)) errors.email = "Enter a valid email address.";
  if (tattooIdea.length < 10) errors.tattooIdea = "Describe your tattoo idea in a little more detail.";
  if (!placement) errors.placement = "Choose a placement.";
  if (!size) errors.size = "Choose an approximate size.";
  if (!preferredDate) errors.preferredDate = "Choose a preferred date.";
  if (!ageConfirmed) errors.ageConfirmed = "Please confirm you are 18 or over.";

  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
  }

  // Past date check
  const today = new Date().toISOString().slice(0, 10);
  if (preferredDate < today) {
    return res.status(422).json({ error: "Please fix the highlighted fields.", fields: { preferredDate: "Choose a date in the future." } });
  }

  const reference = generateReference();
  const booking = {
    reference,
    fullName,
    email,
    phone: get("phone").trim(),
    tattooIdea,
    placement,
    size,
    style: get("style").trim(),
    ink: get("ink").trim(),
    budget: get("budget").trim(),
    preferredDate,
    details: get("details").trim(),
  };

  // Deliver emails
  const env = process.env;
  const smtpUser = env.SMTP_USER || env.GMAIL_USER || "";
  const smtpPass = env.SMTP_PASS || env.GMAIL_APP_PASSWORD || "";
  const smtpHost = env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(env.SMTP_PORT) || 465;
  const adminEmail = env.ADMIN_EMAIL || smtpUser;
  const emailFrom = env.EMAIL_FROM || (smtpUser ? `Rebel Tattoos <${smtpUser}>` : "");
  const siteUrl = (env.PUBLIC_SITE_URL || env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "").replace(/\/$/, "");

  let emailStatus = "unconfigured";
  if (smtpUser && smtpPass) {
    try {
      const textBody = [
        `Hi ${fullName},`,
        "",
        `We received your Rebel Tattoos booking request (${reference}).`,
        "Michelle will review your idea and reply within 2–3 business days.",
        "",
        `Idea: ${tattooIdea}`,
        `Placement: ${placement}`,
        `Size: ${size}`,
        `Preferred date: ${preferredDate}`,
        "",
        "This request does not confirm an appointment.",
        "",
        "— Rebel Tattoos",
      ].join("\n");

      await sendSmtpEmail({
        host: smtpHost, port: smtpPort,
        user: smtpUser, pass: smtpPass,
        from: emailFrom, to: email,
        replyTo: adminEmail || undefined,
        subject: `We received your Rebel Tattoos request — ${reference}`,
        text: textBody,
        html: renderConfirmationEmail(booking),
      });

      if (adminEmail && validEmail(adminEmail)) {
        const adminText = [
          `New booking: ${reference}`,
          `Booker: ${fullName} <${email}>`,
          `Idea: ${tattooIdea}`,
          `Placement: ${placement} | Size: ${size}`,
          `Preferred date: ${preferredDate}`,
          booking.phone ? `Phone: ${booking.phone}` : "",
          booking.details ? `Details: ${booking.details}` : "",
        ].filter(Boolean).join("\n");

        await sendSmtpEmail({
          host: smtpHost, port: smtpPort,
          user: smtpUser, pass: smtpPass,
          from: emailFrom, to: adminEmail,
          replyTo: email,
          subject: `New booking ${reference} — ${fullName}`,
          text: adminText,
          html: renderAdminEmail(booking, siteUrl ? `${siteUrl}/admin` : ""),
        });
      }

      emailStatus = "sent";
    } catch (err) {
      console.error("Email delivery error:", err);
      emailStatus = "failed";
    }
  }

  return res.status(201).json({
    booking: { reference, status: "new" },
    notifications: emailStatus === "sent" ? "queued" : emailStatus,
  });
}

// ── minimal multipart parser ──────────────────────────────────────────────────

async function parseMultipart(req, boundary) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("binary");

  const sep = `--${boundary}`;
  const parts = body.split(sep).slice(1);
  const fields = {};

  for (const part of parts) {
    if (part.trim() === "--" || part.trim() === "") continue;
    const [rawHeaders, ...rest] = part.split("\r\n\r\n");
    const rawValue = rest.join("\r\n\r\n").replace(/\r\n$/, "");
    const disposition = rawHeaders.match(/Content-Disposition:[^\r\n]*/i)?.[0] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    fields[name] = fields[name] || [];
    fields[name].push({ value: rawValue.replace(/\r\n--$/, "") });
  }

  return fields;
}
