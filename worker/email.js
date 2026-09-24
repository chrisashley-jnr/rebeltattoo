import {
  renderAdminBookingEmail,
  renderBookingConfirmationEmail,
  renderManualEmail,
  safeSiteUrl,
} from "./email-template.js";
import { sendSmtpEmail } from "./smtp.js";

function cleanLine(value, max = 180) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function emailAddress(value) {
  const cleaned = cleanLine(value, 254);
  const bracketed = cleaned.match(/<([^<>]+)>$/);
  return (bracketed?.[1] || cleaned).trim();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress(value));
}

function siteAdminUrl(env, bookingId) {
  return safeSiteUrl(env, `/admin?booking=${encodeURIComponent(bookingId)}`)
    || "Open the admin dashboard to review this booking.";
}

export function getSmtpConfig(env = {}) {
  const user = cleanLine(env.SMTP_USER || env.GMAIL_USER, 254);
  const pass = cleanLine(env.SMTP_PASS || env.GMAIL_APP_PASSWORD, 500);
  const host = cleanLine(env.SMTP_HOST, 254) || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT) || 465;
  const configured = Boolean(user && pass);
  return { configured, user, pass, host, port };
}

export function getEffectiveFrom(env = {}) {
  if (validEmail(env.EMAIL_FROM)) return cleanLine(env.EMAIL_FROM, 254);
  const { user } = getSmtpConfig(env);
  if (validEmail(user)) return `Rebel Tattoos <${user}>`;
  return "";
}

export function getEffectiveAdminEmail(env = {}) {
  if (validEmail(env.ADMIN_EMAIL)) return emailAddress(env.ADMIN_EMAIL);
  const { user } = getSmtpConfig(env);
  if (validEmail(user)) return emailAddress(user);
  return "";
}

export function emailDeliveryConfigured(env = {}) {
  const hasResend = Boolean(cleanLine(env.RESEND_API_KEY, 500) && validEmail(env.EMAIL_FROM));
  const { configured: hasSmtp, user: smtpUser } = getSmtpConfig(env);
  const effectiveFrom = validEmail(env.EMAIL_FROM) ? env.EMAIL_FROM : smtpUser;
  return hasResend || (hasSmtp && validEmail(effectiveFrom));
}

export function createBookingEmailRecords(booking, env, now, randomUUID) {
  const effectiveAdmin = getEffectiveAdminEmail(env);
  const summary = [
    `Reference: ${booking.reference}`,
    `Name: ${booking.fullName}`,
    `Email: ${booking.email}`,
    `Preferred date: ${booking.preferredDate}`,
  ].filter(Boolean).join("\n");

  const bookerBody = [
    `Hi ${booking.fullName},`,
    "",
    `We received your Rebel Tattoos booking request (${booking.reference}).`,
    "Michelle will review your idea and reply with timing, pricing, and the clearest next step within 2–3 business days.",
    "",
    "Your request summary:",
    `Idea: ${booking.tattooIdea}`,
    `Placement: ${booking.placement}`,
    `Approximate size: ${booking.size}`,
    `Preferred date: ${booking.preferredDate}`,
    "",
    "This request does not confirm an appointment. Your date is secured after design approval and deposit.",
    "",
    "— Rebel Tattoos",
  ].join("\n");

  const adminBody = [
    `A new booking request is ready: ${booking.reference}.`,
    "",
    summary,
    "",
    siteAdminUrl(env, booking.id),
  ].join("\n");

  return [
    {
      id: randomUUID(),
      bookingId: booking.id,
      audience: "booker",
      recipientEmail: booking.email,
      subject: `We received your Rebel Tattoos request — ${booking.reference}`,
      body: bookerBody,
      html: renderBookingConfirmationEmail(booking, env),
      status: emailDeliveryConfigured(env) ? "pending" : "unconfigured",
      attempts: 0,
      createdAt: now,
      replyTo: effectiveAdmin || undefined,
    },
    {
      id: randomUUID(),
      bookingId: booking.id,
      audience: "admin",
      recipientEmail: effectiveAdmin,
      subject: `New booking ${booking.reference} — ${booking.fullName}`,
      body: adminBody,
      html: renderAdminBookingEmail(booking, env),
      status: emailDeliveryConfigured(env) && effectiveAdmin ? "pending" : "unconfigured",
      attempts: 0,
      createdAt: now,
      replyTo: booking.email,
    },
  ];
}

export function createManualEmailRecords({ booking, audience, subject, body, env, now, randomUUID }) {
  const effectiveAdmin = getEffectiveAdminEmail(env);
  const targets = audience === "both" ? ["booker", "admin"] : [audience];
  return targets.map((target) => {
    const cleanSubject = cleanLine(subject);
    const cleanBody = String(body || "").trim().slice(0, 12000);
    return {
      id: randomUUID(),
      bookingId: booking.id,
      audience: target,
      recipientEmail: target === "booker"
        ? booking.email
        : effectiveAdmin,
      subject: cleanSubject,
      body: cleanBody,
      html: renderManualEmail({ booking, audience: target, subject: cleanSubject, body: cleanBody, env }),
      status: emailDeliveryConfigured(env) && (target !== "admin" || effectiveAdmin) ? "pending" : "unconfigured",
      attempts: 0,
      createdAt: now,
      replyTo: target === "admin"
        ? booking.email
        : (effectiveAdmin || undefined),
    };
  });
}

export async function deliverEmailRecords(records, env, store, emailFetch = fetch, sendSmtp = sendSmtpEmail) {
  const results = [];
  const smtpConfig = getSmtpConfig(env);
  const effectiveFrom = getEffectiveFrom(env);

  for (const record of records) {
    if (!emailDeliveryConfigured(env) || !record.recipientEmail) {
      const result = {
        bookingId: record.bookingId,
        audience: record.audience,
        status: "unconfigured",
        attempted: false,
        error: !record.recipientEmail
          ? "Recipient address is not configured."
          : "Email delivery is not configured.",
      };
      try {
        await store.updateEmailResult(record.id, result);
      } catch (error) {
        console.error("Could not record unconfigured email", error);
      }
      results.push({ id: record.id, ...result });
      continue;
    }

    let result;
    try {
      if (smtpConfig.configured) {
        const smtpResult = await sendSmtp({
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user,
          pass: smtpConfig.pass,
          from: effectiveFrom,
          to: record.recipientEmail,
          replyTo: record.replyTo,
          subject: cleanLine(record.subject),
          text: record.body,
          html: record.html,
        });
        const sentAt = new Date().toISOString();
        result = {
          bookingId: record.bookingId,
          audience: record.audience,
          status: "sent",
          attempted: true,
          providerMessageId: smtpResult?.providerMessageId || `smtp-${Date.now()}`,
          sentAt,
        };
      } else {
        const response = await emailFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `rebel-booking/${record.id}`,
          },
          body: JSON.stringify({
            from: cleanLine(env.EMAIL_FROM, 254),
            to: [record.recipientEmail],
            ...(record.replyTo ? { reply_to: record.replyTo } : {}),
            subject: cleanLine(record.subject),
            text: record.body,
            ...(record.html ? { html: record.html } : {}),
          }),
          signal: AbortSignal.timeout(10_000),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || `Email provider returned ${response.status}.`);
        const sentAt = new Date().toISOString();
        result = {
          bookingId: record.bookingId,
          audience: record.audience,
          status: "sent",
          attempted: true,
          providerMessageId: payload.id || null,
          sentAt,
        };
      }
    } catch (error) {
      result = {
        bookingId: record.bookingId,
        audience: record.audience,
        status: "failed",
        attempted: true,
        error: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.",
      };
    }

    try {
      await store.updateEmailResult(record.id, result);
    } catch (error) {
      console.error("Could not record email delivery result", error);
    }
    results.push({ id: record.id, ...result });
  }
  return results;
}
