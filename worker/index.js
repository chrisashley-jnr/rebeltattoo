import { BOOKING_STATUSES } from "./schema.js";
import { createBookingStore } from "./storage.js";
import {
  createBookingEmailRecords,
  createManualEmailRecords,
  deliverEmailRecords,
  emailDeliveryConfigured,
} from "./email.js";

const SESSION_COOKIE = "rebel_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const encoder = new TextEncoder();

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}

function errorResponse(message, status = 400, fields) {
  return json({ error: message, ...(fields ? { fields } : {}) }, status);
}

function textValue(form, name, max = 2000) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseCookies(header = "") {
  return String(header || "").split(";").reduce((cookies, pair) => {
    const separator = pair.indexOf("=");
    if (separator < 0) return cookies;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name) cookies[name] = value;
    return cookies;
  }, {});
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function equalSecrets(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right || ""))),
  ]);
  return equalBytes(new Uint8Array(leftDigest), new Uint8Array(rightDigest));
}

async function createSessionToken(secret, nowMs, id) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    version: 2,
    id,
    expiresAt: nowMs + SESSION_TTL_SECONDS * 1000,
  })));
  const signature = bytesToBase64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

async function verifySessionToken(token, secret, nowMs) {
  if (!token || !secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  let suppliedSignature;
  let session;
  try {
    suppliedSignature = base64UrlToBytes(signature);
    session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
  } catch {
    return null;
  }
  const expectedSignature = await hmac(secret, payload);
  return (
    equalBytes(suppliedSignature, expectedSignature)
    && session?.version === 2
    && typeof session.id === "string"
    && session.id.length >= 20
    && Number.isFinite(session.expiresAt)
    && session.expiresAt > nowMs
  ) ? session : null;
}

function sessionConfigurationReady(env) {
  return Boolean(env.ADMIN_PASSWORD?.trim().length >= 12 && env.SESSION_SECRET?.trim().length >= 32);
}

async function loginKey(request, secret) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  return bytesToBase64Url(await hmac(secret, `admin-login:${address}`));
}

function adminEmailReady(env) {
  const configured = String(env.ADMIN_EMAIL || env.SMTP_USER || env.GMAIL_USER || "").trim();
  const bracketed = configured.match(/<([^<>]+)>$/);
  const address = (bracketed?.[1] || configured).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function expiredSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function isSameOrigin(request) {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return false;
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 25_000) throw new Error("Request body is too large.");
  const text = await request.text();
  if (encoder.encode(text).length > 25_000) throw new Error("Request body is too large.");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Send a JSON object.");
  return value;
}

function makeReference(now, id) {
  const date = now.slice(0, 10).replaceAll("-", "");
  return `RT-${date}-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function bookingFieldsFromForm(form) {
  return {
    fullName: textValue(form, "fullName", 120),
    email: textValue(form, "email", 254).toLowerCase(),
    phone: textValue(form, "phone", 40),
    tattooIdea: textValue(form, "tattooIdea", 2500),
    placement: textValue(form, "placement", 100),
    size: textValue(form, "size", 100),
    style: textValue(form, "style", 100),
    ink: textValue(form, "ink", 100),
    budget: textValue(form, "budget", 100),
    preferredDate: textValue(form, "preferredDate", 20),
    details: textValue(form, "details", 5000),
    ageConfirmed: ["1", "true", "on", "yes"].includes(textValue(form, "ageConfirmed", 8).toLowerCase()),
  };
}

function validateBooking(fields, today) {
  const errors = {};
  if (fields.fullName.length < 2) errors.fullName = "Enter the name you use for bookings.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = "Enter a complete email address.";
  if (fields.phone && !/^\+?[\d\s().-]{7,30}$/.test(fields.phone)) errors.phone = "Enter a valid phone number or leave this blank.";
  if (fields.tattooIdea.length < 20) errors.tattooIdea = "Share at least a sentence about your idea.";
  for (const field of ["placement", "size", "style", "ink", "budget"]) {
    if (!fields[field]) errors[field] = "Choose an option.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.preferredDate)) errors.preferredDate = "Choose a valid preferred date.";
  else if (fields.preferredDate < today) errors.preferredDate = "Choose today or a future date.";
  if (!fields.ageConfirmed) errors.ageConfirmed = "Confirm that you are 18 or older.";
  return errors;
}

function validateFiles(files) {
  if (files.length > MAX_FILES) return `Choose no more than ${MAX_FILES} reference images.`;
  if (files.some((file) => !IMAGE_TYPES.has(file.type))) return "Reference images must be JPG or PNG files.";
  if (files.some((file) => file.size > MAX_FILE_SIZE)) return "Each reference image must be 10 MB or smaller.";
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_FILE_SIZE) return "Reference images must total 50 MB or less.";
  return "";
}

async function hasValidImageSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

function queueTask(context, task) {
  if (context?.waitUntil) {
    context.waitUntil(task);
    return;
  }
  task.catch(() => {});
}

async function handleCreateBooking(request, env, context, dependencies) {
  if (!isSameOrigin(request)) return errorResponse("This request must come from the same site.", 403);
  if (Number(request.headers.get("Content-Length") || 0) > MAX_TOTAL_FILE_SIZE + 100_000) {
    return errorResponse("The booking request is too large.", 413);
  }
  const store = dependencies.storeFactory(env);
  if (!store) return errorResponse("Booking storage is not configured yet.", 503);

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Send the booking as form data.", 415);
  }

  if (textValue(form, "website", 200)) return json({ booking: { received: true } }, 201);
  const fields = bookingFieldsFromForm(form);
  const now = dependencies.now();
  const fieldErrors = validateBooking(fields, now.slice(0, 10));
  if (Object.keys(fieldErrors).length) return errorResponse("Review the highlighted booking details.", 422, fieldErrors);

  const files = form.getAll("referenceImages").filter((entry) => entry instanceof File && entry.size > 0);
  const fileError = validateFiles(files);
  if (fileError) return errorResponse(fileError, 422, { referenceImages: fileError });
  for (const file of files) {
    if (!(await hasValidImageSignature(file))) {
      return errorResponse("Reference images must be valid JPG or PNG files.", 422, {
        referenceImages: "Choose a valid JPG or PNG image.",
      });
    }
  }
  if (files.length && !env.UPLOADS && !dependencies.allowFilesWithoutBinding) {
    return errorResponse("Reference-image storage is not configured yet.", 503);
  }

  await store.ready();
  const idempotencyKey = (request.headers.get("Idempotency-Key") || "").trim().slice(0, 128);
  if (idempotencyKey) {
    const existing = await store.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return json({
        booking: { id: existing.id, reference: existing.reference, status: existing.status, createdAt: existing.createdAt },
        duplicate: true,
      });
    }
  }

  if (store.countRecentBookingsByEmail) {
    const since = new Date(new Date(now).getTime() - 15 * 60 * 1000).toISOString();
    const recentCount = await store.countRecentBookingsByEmail(fields.email, since);
    if (recentCount >= 3) {
      return errorResponse("Too many recent requests were sent for this email. Please wait 15 minutes and try again.", 429);
    }
  }
  const id = dependencies.randomUUID();
  const booking = {
    id,
    reference: makeReference(now, id),
    createdAt: now,
    updatedAt: now,
    status: "new",
    ...fields,
    adminNotes: "",
    lastContactedAt: null,
    idempotencyKey: idempotencyKey || null,
  };
  const storedFiles = files.map((file) => {
    const fileId = dependencies.randomUUID();
    const extension = file.type === "image/png" ? "png" : "jpg";
    return {
      id: fileId,
      bookingId: booking.id,
      objectKey: `bookings/${booking.id}/${fileId}.${extension}`,
      name: file.name.slice(0, 240),
      type: file.type,
      size: file.size,
      createdAt: now,
      body: file.stream(),
    };
  });
  const emails = createBookingEmailRecords(booking, env, now, dependencies.randomUUID);

  try {
    for (const file of storedFiles) await store.putFile(file);
    await store.createBooking(booking, storedFiles.map(({ body, ...file }) => file), emails);
  } catch (error) {
    await Promise.allSettled(storedFiles.map((file) => store.deleteFile(file.objectKey)));
    if (idempotencyKey) {
      const existing = await store.findByIdempotencyKey(idempotencyKey).catch(() => null);
      if (existing) {
        return json({
          booking: { id: existing.id, reference: existing.reference, status: existing.status, createdAt: existing.createdAt },
          duplicate: true,
        });
      }
    }
    return errorResponse(
      error instanceof Error && /configured/i.test(error.message)
        ? error.message
        : "We could not save the request. Please try again.",
      503,
    );
  }

  queueTask(context, deliverEmailRecords(emails, env, store, dependencies.emailFetch, dependencies.sendSmtp));
  return json({
    booking: { id: booking.id, reference: booking.reference, status: booking.status, createdAt: booking.createdAt },
    notifications: emailDeliveryConfigured(env) && adminEmailReady(env) ? "queued" : "pending_configuration",
  }, 201);
}

async function requireAdmin(request, env, dependencies) {
  if (!sessionConfigurationReady(env)) return errorResponse("Admin access is not configured yet.", 503);
  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  const session = await verifySessionToken(token, env.SESSION_SECRET, dependencies.nowMs());
  if (!session) return errorResponse("Sign in to access the booking dashboard.", 401);
  const store = dependencies.storeFactory(env);
  if (!store) return errorResponse("Booking storage is not configured yet.", 503);
  return await store.hasAdminSession(session.id, dependencies.nowMs())
    ? null
    : errorResponse("Sign in to access the booking dashboard.", 401);
}

async function handleSession(request, env, dependencies) {
  if (!sessionConfigurationReady(env)) return errorResponse("Admin access is not configured yet.", 503);
  if (["POST", "DELETE"].includes(request.method) && !isSameOrigin(request)) {
    return errorResponse("This request must come from the same site.", 403);
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await readJson(request);
    } catch {
      return errorResponse("Enter the admin password.", 400);
    }
    const store = dependencies.storeFactory(env);
    if (!store) return errorResponse("Booking storage is not configured yet.", 503);
    await store.ready();
    const key = await loginKey(request, env.SESSION_SECRET);
    const nowMs = dependencies.nowMs();
    if (await store.getLoginAttempts(key, nowMs) >= MAX_LOGIN_FAILURES) {
      return json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, 429, { "Retry-After": "900" });
    }
    if (!(await equalSecrets(body?.password, env.ADMIN_PASSWORD))) {
      await store.recordLoginFailure(key, nowMs, LOGIN_WINDOW_MS);
      return errorResponse("That password is not correct.", 401);
    }
    await store.clearLoginFailures(key);
    const id = dependencies.randomUUID();
    await store.createAdminSession(id, nowMs + SESSION_TTL_SECONDS * 1000, nowMs);
    const token = await createSessionToken(env.SESSION_SECRET, nowMs, id);
    return json({ authenticated: true }, 200, { "Set-Cookie": sessionCookie(token, request) });
  }

  if (request.method === "DELETE") {
    const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
    const session = await verifySessionToken(token, env.SESSION_SECRET, dependencies.nowMs());
    if (session) {
      const store = dependencies.storeFactory(env);
      await store?.deleteAdminSession(session.id);
    }
    return json({ authenticated: false }, 200, { "Set-Cookie": expiredSessionCookie(request) });
  }

  if (request.method === "GET") {
    const unauthorized = await requireAdmin(request, env, dependencies);
    if (unauthorized) return unauthorized;
    return json({
      authenticated: true,
      adminEmail: env.ADMIN_EMAIL || env.SMTP_USER || env.GMAIL_USER || "",
      emailConfigured: emailDeliveryConfigured(env) && adminEmailReady(env),
    });
  }

  return errorResponse("Method not allowed.", 405);
}

async function handleAdminApi(request, env, dependencies, pathname) {
  const unauthorized = await requireAdmin(request, env, dependencies);
  if (unauthorized) return unauthorized;
  if (["POST", "PATCH", "DELETE"].includes(request.method) && !isSameOrigin(request)) {
    return errorResponse("This request must come from the same site.", 403);
  }
  const store = dependencies.storeFactory(env);
  if (!store) return errorResponse("Booking storage is not configured yet.", 503);
  await store.ready();

  if (pathname === "/api/admin/bookings" && request.method === "GET") {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "all";
    const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
    if (status !== "all" && !BOOKING_STATUSES.includes(status)) return errorResponse("Unknown booking status.", 400);
    const bookings = await store.listBookings({ status, query });
    return json({ bookings, statuses: BOOKING_STATUSES });
  }

  const bookingMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
  if (bookingMatch) {
    const id = decodeURIComponent(bookingMatch[1]);
    if (request.method === "GET") {
      const booking = await store.getBooking(id);
      return booking ? json({ booking }) : errorResponse("Booking not found.", 404);
    }
    if (request.method === "PATCH") {
      let body;
      try {
        body = await readJson(request);
      } catch {
        return errorResponse("Send a valid booking update.", 400);
      }
      const status = String(body?.status || "");
      const adminNotes = String(body?.adminNotes || "").trim().slice(0, 6000);
      if (!BOOKING_STATUSES.includes(status)) return errorResponse("Choose a valid booking status.", 422);
      const booking = await store.updateBooking(id, { status, adminNotes, updatedAt: dependencies.now() });
      return booking ? json({ booking }) : errorResponse("Booking not found.", 404);
    }
    return errorResponse("Method not allowed.", 405);
  }

  const emailMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/emails$/);
  if (emailMatch && request.method === "POST") {
    const booking = await store.getBooking(decodeURIComponent(emailMatch[1]));
    if (!booking) return errorResponse("Booking not found.", 404);
    let body;
    try {
      body = await readJson(request);
    } catch {
      return errorResponse("Send a valid email draft.", 400);
    }
    const audience = String(body?.audience || "");
    const subject = String(body?.subject || "").trim();
    const message = String(body?.body || "").trim();
    if (!["booker", "admin", "both"].includes(audience)) return errorResponse("Choose who should receive the email.", 422);
    if (subject.length < 3 || subject.length > 180) return errorResponse("Enter an email subject between 3 and 180 characters.", 422);
    if (message.length < 3 || message.length > 12000) return errorResponse("Enter an email message between 3 and 12,000 characters.", 422);
    if (["admin", "both"].includes(audience) && !adminEmailReady(env)) return errorResponse("Add a valid ADMIN_EMAIL before emailing the studio.", 503);

    const emails = createManualEmailRecords({
      booking,
      audience,
      subject,
      body: message,
      env,
      now: dependencies.now(),
      randomUUID: dependencies.randomUUID,
    });
    await store.addEmails(emails);
    const delivery = await deliverEmailRecords(emails, env, store, dependencies.emailFetch, dependencies.sendSmtp);
    const deliveredCount = delivery.filter((result) => result.status === "sent").length;
    const failed = deliveredCount !== delivery.length;
    return json(
      { emails: delivery, partial: failed && deliveredCount > 0 },
      failed ? 207 : 201,
    );
  }

  const fileMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/files\/([^/]+)$/);
  if (fileMatch && request.method === "GET") {
    const result = await store.readBookingFile(
      decodeURIComponent(fileMatch[1]),
      decodeURIComponent(fileMatch[2]),
    );
    if (!result) return errorResponse("Reference image not found.", 404);
    const { file, object } = result;
    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    headers.set("X-Content-Type-Options", "nosniff");
    if (!headers.has("Content-Type")) headers.set("Content-Type", file.type);
    return new Response(object.body, { headers });
  }

  return errorResponse("API route not found.", 404);
}

async function handleApi(request, env, context, dependencies) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/bookings") {
    return request.method === "POST"
      ? handleCreateBooking(request, env, context, dependencies)
      : errorResponse("Method not allowed.", 405);
  }
  if (pathname === "/api/admin/session") return handleSession(request, env, dependencies);
  if (pathname.startsWith("/api/admin/")) return handleAdminApi(request, env, dependencies, pathname);
  return errorResponse("API route not found.", 404);
}

export function createWorker(overrides = {}) {
  const dependencies = {
    storeFactory: overrides.storeFactory || createBookingStore,
    emailFetch: overrides.emailFetch || fetch,
    sendSmtp: overrides.sendSmtp,
    now: overrides.now || (() => new Date().toISOString()),
    nowMs: overrides.nowMs || (() => Date.now()),
    randomUUID: overrides.randomUUID || (() => crypto.randomUUID()),
    allowFilesWithoutBinding: Boolean(overrides.allowFilesWithoutBinding),
  };

  return {
    async fetch(request, env, context) {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        try {
          return await handleApi(request, env, context, dependencies);
        } catch (error) {
          console.error("Rebel Tattoos API error", error);
          return errorResponse("Something went wrong. Please try again.", 500);
        }
      }

      const response = await env.ASSETS.fetch(request);
      const acceptsHtml = request.headers.get("accept")?.includes("text/html");
      if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) return response;

      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/index.html";
      indexUrl.search = "";
      return env.ASSETS.fetch(new Request(indexUrl, request));
    },
  };
}

export default createWorker();
