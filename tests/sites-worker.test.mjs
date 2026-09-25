import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  renderBookingConfirmationEmail,
  renderAdminBookingEmail,
  renderManualEmail,
} from "../worker/email-template.js";
import { createBookingEmailRecords, deliverEmailRecords, emailDeliveryConfigured } from "../worker/email.js";
import { createSignedRelayRequest, getEmailRelayConfig } from "../worker/email-relay.js";
import { buildMimeMessage } from "../worker/smtp.js";
import { createEmailRelay, verifyRelayEnvelope } from "../api/email-relay.js";
import worker, { createWorker } from "../worker/index.js";
import { createDevBindings } from "../worker/dev-adapter.js";
import legacyBookingHandler from "../api/bookings.js";

const FIXED_NOW = "2026-09-22T12:00:00.000Z";
const FIXED_NOW_MS = Date.parse(FIXED_NOW);

test("SMTP messages use a real sender domain and standards-compliant UTF-8 MIME", () => {
  const raw = buildMimeMessage({
    from: "Rebel Tattoos <studio@gmail.com>",
    to: "booker@example.test",
    replyTo: "studio@gmail.com",
    subject: "We received your request — RT-123",
    text: "Thank you — your request arrived.",
    html: "<p>Thank you — your request arrived.</p>",
  });
  assert.match(raw, /Message-ID: <[a-f0-9-]+@gmail\.com>\r\n/);
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.equal((raw.match(/Content-Transfer-Encoding: base64/g) || []).length, 2);
  assert.doesNotMatch(raw, /@rebeltattoos>|Content-Transfer-Encoding: 8bit|display:none/);
  assert.ok(raw.endsWith("\r\n"));
  assert.ok(raw.includes(Buffer.from("Thank you — your request arrived.").toString("base64")));
});

test("local development URLs are omitted from booking emails", () => {
  const booking = bookingFixture();
  const env = { PUBLIC_SITE_URL: "http://localhost:5173", ADMIN_EMAIL: "studio@example.test" };
  const bookerHtml = renderBookingConfirmationEmail(booking, env);
  const adminHtml = renderAdminBookingEmail(booking, env);
  const records = createBookingEmailRecords(booking, env, FIXED_NOW, () => crypto.randomUUID());
  assert.doesNotMatch(bookerHtml, /localhost|display:none|href=/i);
  assert.doesNotMatch(adminHtml, /localhost|display:none|href=/i);
  assert.doesNotMatch(records[1].body, /localhost/i);
});

test("legacy deployment rejects bookings it cannot persist", () => {
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  legacyBookingHandler({ method: "POST" }, response);
  assert.equal(response.statusCode, 503);
  assert.match(response.payload.error, /unavailable/);
  assert.equal(headers["content-type"], "application/json; charset=utf-8");
});

function createIdFactory(ids) {
  let index = 0;
  return () => ids[index++] || `generated-id-${index}`;
}

function bookingFixture(overrides = {}) {
  return {
    id: "booking-admin-1",
    reference: "RT-20260922-ADMIN1",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    status: "new",
    fullName: "Ama Mensah",
    email: "ama@example.test",
    phone: "+233 20 555 0101",
    tattooIdea: "A fine-line botanical piece inspired by hibiscus flowers.",
    placement: "Forearm",
    size: "Palm-sized",
    style: "Fine line",
    ink: "Black ink",
    budget: "GHS 1,000–2,500",
    preferredDate: "2026-10-20",
    details: "First tattoo.",
    ageConfirmed: true,
    adminNotes: "",
    lastContactedAt: null,
    attachmentCount: 0,
    failedEmailCount: 0,
    attachments: [],
    emails: [],
    ...overrides,
  };
}

function createFakeStore(initialBooking = null) {
  const state = {
    booking: initialBooking,
    createdBookings: [],
    createdFiles: [],
    createdEmails: [],
    addedEmails: [],
    emailUpdates: [],
    listQueries: [],
    sessions: new Map(),
    loginAttempts: new Map(),
  };

  const store = {
    async ready() {},
    async createAdminSession(id, expiresAt) { state.sessions.set(id, expiresAt); },
    async hasAdminSession(id, nowMs) { return (state.sessions.get(id) || 0) > nowMs; },
    async deleteAdminSession(id) { state.sessions.delete(id); },
    async getLoginAttempts(key, nowMs) {
      const attempt = state.loginAttempts.get(key);
      return attempt && attempt.until > nowMs ? attempt.count : 0;
    },
    async recordLoginFailure(key, nowMs, windowMs) {
      const previous = state.loginAttempts.get(key);
      state.loginAttempts.set(key, {
        count: previous && previous.until > nowMs ? previous.count + 1 : 1,
        until: previous && previous.until > nowMs ? previous.until : nowMs + windowMs,
      });
    },
    async clearLoginFailures(key) { state.loginAttempts.delete(key); },
    async findByIdempotencyKey() {
      return null;
    },
    async createBooking(booking, files, emails) {
      state.booking = bookingFixture({ ...booking, attachments: files, emails });
      state.createdBookings.push(booking);
      state.createdFiles.push(...files);
      state.createdEmails.push(...emails);
      return state.booking;
    },
    async listBookings(query) {
      state.listQueries.push(query);
      return state.booking ? [state.booking] : [];
    },
    async getBooking(id) {
      return state.booking?.id === id ? state.booking : null;
    },
    async updateBooking(id, update) {
      if (state.booking?.id !== id) return null;
      state.booking = { ...state.booking, ...update };
      return state.booking;
    },
    async addEmails(emails) {
      state.addedEmails.push(...emails);
      if (state.booking) {
        state.booking = {
          ...state.booking,
          emails: [...(state.booking.emails || []), ...emails],
        };
      }
      return emails;
    },
    async updateEmailResult(id, result) {
      state.emailUpdates.push({ id, ...result });
    },
    async putFile(file) {
      state.createdFiles.push(file);
    },
    async deleteFile() {},
    async readBookingFile() {
      return null;
    },
  };

  return { state, store };
}

function validBookingForm() {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    fullName: "  Ama Mensah  ",
    email: "AMA@EXAMPLE.TEST",
    phone: "+233 20 555 0101",
    tattooIdea: "A fine-line botanical piece inspired by hibiscus flowers.",
    placement: "Forearm",
    size: "Palm-sized",
    style: "Fine line",
    ink: "Black ink",
    budget: "GHS 1,000–2,500",
    preferredDate: "2026-10-20",
    details: "This will be my first tattoo.",
    ageConfirmed: "true",
  })) {
    form.set(name, value);
  }
  return form;
}

function configuredEnv(overrides = {}) {
  return {
    ADMIN_EMAIL: "studio@example.test",
    ADMIN_PASSWORD: "correct horse battery staple",
    SESSION_SECRET: "a-long-session-signing-secret-for-tests",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "bookings@example.test",
    PUBLIC_SITE_URL: "https://example.test",
    ...overrides,
  };
}

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("serves the app shell without redirecting an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/" ? "app" : "missing", {
            status: url.pathname === "/" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, request.method === "POST" ? 1 : 0);
  }
});

test("creates a public booking and queues booker and admin emails", async () => {
  const { state, store } = createFakeStore();
  const queuedTasks = [];
  const emailRequests = [];
  const api = createWorker({
    storeFactory: () => store,
    now: () => FIXED_NOW,
    nowMs: () => FIXED_NOW_MS,
    randomUUID: createIdFactory([
      "booking-000001",
      "email-booker-0001",
      "email-admin-00001",
    ]),
    emailFetch: async (url, options) => {
      emailRequests.push({ url, options, payload: JSON.parse(options.body) });
      return Response.json({ id: `provider-message-${emailRequests.length}` });
    },
  });

  const response = await api.fetch(
    new Request("https://example.test/api/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": "booking-attempt-1" },
      body: validBookingForm(),
    }),
    configuredEnv(),
    { waitUntil: (task) => queuedTasks.push(task) },
  );
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.booking.id, "booking-000001");
  assert.equal(payload.booking.reference, "RT-20260922-BOOKING000");
  assert.equal(payload.booking.status, "new");
  assert.equal(payload.notifications, "queued");
  assert.equal(state.createdBookings.length, 1);
  assert.equal(state.createdBookings[0].fullName, "Ama Mensah");
  assert.equal(state.createdBookings[0].email, "ama@example.test");
  assert.equal(state.createdBookings[0].idempotencyKey, "booking-attempt-1");
  assert.deepEqual(state.createdFiles, []);
  assert.deepEqual(state.createdEmails.map(({ audience, recipientEmail, status }) => ({ audience, recipientEmail, status })), [
    { audience: "booker", recipientEmail: "ama@example.test", status: "pending" },
    { audience: "admin", recipientEmail: "studio@example.test", status: "pending" },
  ]);
  assert.equal(queuedTasks.length, 1);

  await Promise.all(queuedTasks);
  assert.equal(emailRequests.length, 2);
  assert.deepEqual(emailRequests.map(({ payload: email }) => email.to[0]), ["ama@example.test", "studio@example.test"]);
  assert.ok(emailRequests.every(({ options }) => options.headers.Authorization === "Bearer re_test_key"));
  assert.ok(emailRequests.every(({ payload: email }) => email.text && email.html));
  assert.equal(emailRequests[0].payload.reply_to, "studio@example.test");
  assert.equal(emailRequests[1].payload.reply_to, "ama@example.test");
  assert.equal(emailRequests[0].options.headers["Idempotency-Key"], "rebel-booking/email-booker-0001");
  assert.equal(emailRequests[1].options.headers["Idempotency-Key"], "rebel-booking/email-admin-00001");
  assert.match(emailRequests[0].payload.html, /Your idea is in\./);
  assert.match(emailRequests[0].payload.html, /RT-20260922-BOOKING000/);
  assert.match(emailRequests[0].payload.html, /border-radius:16px/);
  assert.match(emailRequests[0].payload.html, /#4b2a50/);
  assert.match(emailRequests[0].payload.html, /#741f3a/);
  assert.match(emailRequests[0].payload.html, /#f3eee6/);
  assert.doesNotMatch(emailRequests[0].payload.html, /\/admin\?booking=/);
  assert.match(emailRequests[1].payload.html, /\/admin\?booking=booking-000001/);
  assert.deepEqual(state.emailUpdates.map(({ audience, status }) => ({ audience, status })), [
    { audience: "booker", status: "sent" },
    { audience: "admin", status: "sent" },
  ]);
});

test("escapes booking and manual message content in branded HTML emails", () => {
  const booking = bookingFixture({
    reference: 'RT-<&"',
    fullName: '<script>alert("name")</script> & Ama',
    tattooIdea: '<img src=x onerror="alert(1)">',
  });
  const env = configuredEnv();

  const confirmation = renderBookingConfirmationEmail(booking, env);
  assert.doesNotMatch(confirmation, /<script|<img\s/i);
  assert.match(confirmation, /&lt;script&gt;/);
  assert.match(confirmation, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(confirmation, /RT-&lt;&amp;&quot;/);

  const manual = renderManualEmail({
    booking,
    audience: "booker",
    subject: '<img src=x onerror="alert(2)"> Update',
    body: 'First line\n<script>alert("body")</script>',
    env,
  });
  assert.doesNotMatch(manual, /<script|<img\s/i);
  assert.match(manual, /First line<br>&lt;script&gt;/);
  assert.match(manual, /&lt;img src=x onerror=&quot;alert\(2\)&quot;&gt; Update/);
});

test("rejects a preferred date in the past", async () => {
  const { state, store } = createFakeStore();
  const form = validBookingForm();
  form.set("preferredDate", "2026-09-21");
  const api = createWorker({
    storeFactory: () => store,
    now: () => FIXED_NOW,
    nowMs: () => FIXED_NOW_MS,
  });

  const response = await api.fetch(new Request("https://example.test/api/bookings", {
    method: "POST",
    body: form,
  }), configuredEnv());
  const payload = await response.json();

  assert.equal(response.status, 422);
  assert.equal(payload.fields.preferredDate, "Choose today or a future date.");
  assert.equal(state.createdBookings.length, 0);
});

test("returns a JSON 404 for an unknown API route without consulting static assets", async () => {
  let assetCalls = 0;
  const api = createWorker();
  const response = await api.fetch(new Request("https://example.test/api/not-a-route"), {
    ASSETS: {
      fetch: async () => {
        assetCalls += 1;
        return new Response("app", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await response.json(), { error: "API route not found." });
  assert.equal(assetCalls, 0);
});

test("supports admin login, session, booking list and update, and email to both recipients", async () => {
  const { state, store } = createFakeStore(bookingFixture());
  const emailRequests = [];
  const api = createWorker({
    storeFactory: () => store,
    now: () => FIXED_NOW,
    nowMs: () => FIXED_NOW_MS,
    randomUUID: createIdFactory(["admin-session-0000000000000001", "manual-booker-email", "manual-admin-email"]),
    emailFetch: async (url, options) => {
      emailRequests.push({ url, payload: JSON.parse(options.body) });
      return Response.json({ id: `manual-provider-${emailRequests.length}` });
    },
  });
  const env = configuredEnv();

  const loginResponse = await api.fetch(new Request("https://example.test/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }), env);
  const setCookie = loginResponse.headers.get("set-cookie");
  const cookie = setCookie.split(";", 1)[0];

  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), { authenticated: true });
  assert.match(setCookie, /rebel_admin_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Secure/);

  const sessionResponse = await api.fetch(new Request("https://example.test/api/admin/session", {
    headers: { Cookie: cookie },
  }), env);
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), {
    authenticated: true,
    adminEmail: "studio@example.test",
    emailConfigured: true,
  });

  const listResponse = await api.fetch(new Request("https://example.test/api/admin/bookings?status=all&q=ama", {
    headers: { Cookie: cookie },
  }), env);
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.bookings.length, 1);
  assert.equal(listPayload.bookings[0].id, "booking-admin-1");
  assert.deepEqual(state.listQueries, [{ status: "all", query: "ama" }]);
  assert.ok(listPayload.statuses.includes("in_review"));

  const updateResponse = await api.fetch(new Request("https://example.test/api/admin/bookings/booking-admin-1", {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_review", adminNotes: "Check final placement during consultation." }),
  }), env);
  const updatePayload = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updatePayload.booking.status, "in_review");
  assert.equal(updatePayload.booking.adminNotes, "Check final placement during consultation.");

  const emailResponse = await api.fetch(new Request("https://example.test/api/admin/bookings/booking-admin-1/emails", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: "both",
      subject: "Consultation availability",
      body: "A consultation slot is available next week.",
    }),
  }), env);
  const emailPayload = await emailResponse.json();

  assert.equal(emailResponse.status, 201);
  assert.deepEqual(state.addedEmails.map(({ audience, recipientEmail }) => ({ audience, recipientEmail })), [
    { audience: "booker", recipientEmail: "ama@example.test" },
    { audience: "admin", recipientEmail: "studio@example.test" },
  ]);
  assert.deepEqual(emailRequests.map(({ payload: email }) => email.to[0]), ["ama@example.test", "studio@example.test"]);
  assert.ok(emailRequests.every(({ payload: email }) => email.text && email.html));
  assert.match(emailRequests[0].payload.html, /Consultation availability/);
  assert.match(emailRequests[0].payload.html, /A consultation slot is available next week\./);
  assert.doesNotMatch(emailRequests[0].payload.html, /\/admin\?booking=/);
  assert.match(emailRequests[1].payload.html, /\/admin\?booking=booking-admin-1/);
  assert.deepEqual(emailPayload.emails.map(({ audience, status }) => ({ audience, status })), [
    { audience: "booker", status: "sent" },
    { audience: "admin", status: "sent" },
  ]);
});

test("reports partial delivery so a failed recipient can be retried without duplicating the successful email", async () => {
  const { store } = createFakeStore(bookingFixture());
  let emailRequestCount = 0;
  const api = createWorker({
    storeFactory: () => store,
    now: () => FIXED_NOW,
    nowMs: () => FIXED_NOW_MS,
    randomUUID: createIdFactory(["admin-session-0000000000000002", "partial-booker-email", "partial-admin-email"]),
    emailFetch: async () => {
      emailRequestCount += 1;
      return emailRequestCount === 1
        ? Response.json({ id: "sent-booker" })
        : Response.json({ message: "Temporary provider failure" }, { status: 503 });
    },
  });
  const env = configuredEnv();
  const loginResponse = await api.fetch(new Request("https://example.test/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }), env);
  const cookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];

  const response = await api.fetch(new Request("https://example.test/api/admin/bookings/booking-admin-1/emails", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ audience: "both", subject: "Next step", body: "Here is the next step for your booking." }),
  }), env);
  const payload = await response.json();

  assert.equal(response.status, 207);
  assert.equal(payload.partial, true);
  assert.deepEqual(payload.emails.map(({ audience, status }) => ({ audience, status })), [
    { audience: "booker", status: "sent" },
    { audience: "admin", status: "failed" },
  ]);
});

test("reports every failed email while preserving recipient-specific retry details", async () => {
  const { store } = createFakeStore(bookingFixture());
  const api = createWorker({
    storeFactory: () => store,
    now: () => FIXED_NOW,
    nowMs: () => FIXED_NOW_MS,
    randomUUID: createIdFactory(["admin-session-0000000000000003", "failed-booker-email", "failed-admin-email"]),
    emailFetch: async () => Response.json({ message: "Temporary provider failure" }, { status: 503 }),
  });
  const env = configuredEnv();
  const loginResponse = await api.fetch(new Request("https://example.test/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }), env);
  const cookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];
  const response = await api.fetch(new Request("https://example.test/api/admin/bookings/booking-admin-1/emails", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ audience: "both", subject: "Next step", body: "Here is the next step for your booking." }),
  }), env);
  const payload = await response.json();

  assert.equal(response.status, 207);
  assert.equal(payload.partial, false);
  assert.deepEqual(payload.emails.map(({ audience, status }) => ({ audience, status })), [
    { audience: "booker", status: "failed" },
    { audience: "admin", status: "failed" },
  ]);
});

test("emits all worker modules, hosting metadata, and the booking migration", async () => {
  const requiredOutputs = [
    "../dist/client/index.html",
    "../dist/server/index.js",
    "../dist/server/schema.js",
    "../dist/server/storage.js",
    "../dist/server/email.js",
    "../dist/server/email-template.js",
    "../dist/.openai/hosting.json",
    "../dist/.openai/drizzle/0000_booking_admin.sql",
    "../dist/.openai/drizzle/0001_email_html.sql",
    "../dist/.openai/drizzle/0002_admin_security.sql",
  ];
  await Promise.all(requiredOutputs.map((path) => access(new URL(path, import.meta.url))));

  const hosting = JSON.parse(await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../dist/.openai/drizzle/0000_booking_admin.sql", import.meta.url), "utf8");
  const emailMigration = await readFile(new URL("../dist/.openai/drizzle/0001_email_html.sql", import.meta.url), "utf8");
  const securityMigration = await readFile(new URL("../dist/.openai/drizzle/0002_admin_security.sql", import.meta.url), "utf8");
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "UPLOADS");
  if (hosting.project_id !== undefined) assert.equal(typeof hosting.project_id, "string");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS bookings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS booking_files/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS booking_emails/);
  assert.match(emailMigration, /ADD COLUMN body_html/);
  assert.match(securityMigration, /CREATE TABLE IF NOT EXISTS admin_sessions/);
  assert.match(securityMigration, /CREATE TABLE IF NOT EXISTS admin_login_attempts/);
});

test("upgrades existing email records and persists branded HTML", async () => {
  const initialMigration = await readFile(new URL("../.openai/drizzle/0000_booking_admin.sql", import.meta.url), "utf8");
  const emailMigration = await readFile(new URL("../.openai/drizzle/0001_email_html.sql", import.meta.url), "utf8");
  const database = new DatabaseSync(":memory:");

  try {
    database.exec(initialMigration);
    const insertBooking = database.prepare(`INSERT INTO bookings (
      id, reference, created_at, updated_at, full_name, email, tattoo_idea,
      placement, approximate_size, style, ink, budget, preferred_date, age_confirmed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertBooking.run(
      "legacy-booking", "RT-LEGACY", FIXED_NOW, FIXED_NOW, "Ama Mensah", "ama@example.test",
      "Hibiscus", "Forearm", "Palm-sized", "Fine line", "Black ink", "GHS 1,000–2,500",
      "2026-10-20", 1,
    );
    insertBooking.run(
      "new-booking", "RT-NEW", FIXED_NOW, FIXED_NOW, "Ama Mensah", "ama@example.test",
      "Hibiscus", "Forearm", "Palm-sized", "Fine line", "Black ink", "GHS 1,000–2,500",
      "2026-10-20", 1,
    );
    database.prepare(`INSERT INTO booking_emails (
      id, booking_id, audience, recipient_email, subject, body_text,
      status, attempts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "legacy-email",
      "legacy-booking",
      "booker",
      "ama@example.test",
      "Legacy message",
      "Plain text only",
      "sent",
      1,
      FIXED_NOW,
    );

    database.exec(emailMigration);
    assert.equal(
      database.prepare("SELECT body_html FROM booking_emails WHERE id = ?").get("legacy-email").body_html,
      "",
    );

    database.prepare(`INSERT INTO booking_emails (
      id, booking_id, audience, recipient_email, subject, body_text, body_html,
      status, attempts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "branded-email",
      "new-booking",
      "booker",
      "ama@example.test",
      "Your idea is in",
      "Plain-text fallback",
      "<!doctype html><html><body>Branded confirmation</body></html>",
      "pending",
      0,
      FIXED_NOW,
    );

    assert.match(
      database.prepare("SELECT body_html FROM booking_emails WHERE id = ?").get("branded-email").body_html,
      /Branded confirmation/,
    );
  } finally {
    database.close();
  }
});

test("creates a booking and delivers emails via Gmail SMTP", async () => {
  const { state, store } = createFakeStore();
  const queuedTasks = [];
  const smtpCalls = [];
  const api = createWorker({
    storeFactory: () => store,
    now: () => FIXED_NOW,
    nowMs: () => FIXED_NOW_MS,
    randomUUID: createIdFactory([
      "booking-smtp-1",
      "email-smtp-booker",
      "email-smtp-admin",
    ]),
    sendSmtp: async (payload) => {
      smtpCalls.push(payload);
      return { ok: true, providerMessageId: "smtp-msg-123" };
    },
  });

  const response = await api.fetch(
    new Request("https://example.test/api/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": "booking-smtp-attempt" },
      body: validBookingForm(),
    }),
    {
      ADMIN_PASSWORD: "test",
      SESSION_SECRET: "12345678901234567890123456789012",
      SMTP_USER: "rebeltattoo101@gmail.com",
      SMTP_PASS: "hpvytzipooxdrgay",
      PUBLIC_SITE_URL: "https://example.test",
    },
    { waitUntil: (task) => queuedTasks.push(task) },
  );

  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.notifications, "queued");

  await Promise.all(queuedTasks);
  assert.equal(smtpCalls.length, 2);
  assert.equal(smtpCalls[0].to, "ama@example.test");
  assert.equal(smtpCalls[0].from, "Rebel Tattoos <rebeltattoo101@gmail.com>");
  assert.equal(smtpCalls[1].to, "rebeltattoo101@gmail.com");
  assert.match(smtpCalls[0].html, /Your idea is in/);
});

test("Gmail relay signs and delivers both booking messages without exposing SMTP credentials to Sites", async () => {
  const secret = "a-very-long-random-relay-secret-for-testing";
  const siteEnv = {
    ADMIN_EMAIL: "studio@gmail.com",
    EMAIL_RELAY_URL: "https://rebeltattoo.vercel.app/api/email-relay",
    EMAIL_RELAY_SECRET: secret,
    PUBLIC_SITE_URL: "https://example.test",
  };
  const relayEnv = {
    EMAIL_RELAY_SECRET: secret,
    SMTP_USER: "studio@gmail.com",
    SMTP_PASS: "test-app-password",
  };
  const sent = [];
  const relay = createEmailRelay(async (message) => {
    sent.push(message);
    return { messageId: `gmail-${sent.length}` };
  }, relayEnv);
  const { state, store } = createFakeStore();
  const records = createBookingEmailRecords(bookingFixture(), siteEnv, FIXED_NOW, createIdFactory([
    "email-booker-0001", "email-admin-0002",
  ]));
  const fetched = [];
  const emailFetch = async (url, options) => {
    fetched.push({ url, options });
    const response = {
      setHeader() {},
      status(value) { this.statusCode = value; return this; },
      json(value) { this.payload = value; return this; },
    };
    await relay({ method: "POST", body: JSON.parse(options.body), headers: {} }, response);
    return Response.json(response.payload, { status: response.statusCode });
  };

  assert.equal(emailDeliveryConfigured(siteEnv), true);
  assert.equal(getEmailRelayConfig({ ...siteEnv, EMAIL_RELAY_URL: "http://localhost:3000/mail" }).configured, false);
  const result = await deliverEmailRecords(records, siteEnv, store, emailFetch);
  assert.deepEqual(result.map((entry) => entry.status), ["sent", "sent"]);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to, "ama@example.test");
  assert.equal(sent[1].to, "studio@gmail.com");
  assert.equal(sent[0].from, "Rebel Tattoos <studio@gmail.com>");
  assert.equal(sent[0].replyTo, "studio@gmail.com");
  assert.equal(sent[1].replyTo, "ama@example.test");
  assert.match(sent[0].html, /Your idea is in/);
  assert.deepEqual(state.emailUpdates.map((entry) => entry.status), ["sent", "sent"]);
  assert.ok(fetched.every(({ url }) => url === siteEnv.EMAIL_RELAY_URL));
  assert.ok(fetched.every(({ options }) => !options.body.includes("test-app-password")));
});

test("Gmail relay rejects tampering, old signatures, invalid mail, and direct browser requests", async () => {
  const secret = "a-very-long-random-relay-secret-for-testing";
  const record = createBookingEmailRecords(bookingFixture(), {
    ADMIN_EMAIL: "studio@gmail.com",
    EMAIL_RELAY_URL: "https://rebeltattoo.vercel.app/api/email-relay",
    EMAIL_RELAY_SECRET: secret,
  }, FIXED_NOW, createIdFactory(["email-booker-0001", "email-admin-0002"]))[0];
  const envelope = await createSignedRelayRequest(record, secret, FIXED_NOW_MS);
  assert.equal(verifyRelayEnvelope(envelope, secret, FIXED_NOW_MS).to, record.recipientEmail);
  assert.equal(verifyRelayEnvelope({ ...envelope, payload: envelope.payload.replace("ama@", "eve@") }, secret, FIXED_NOW_MS), null);
  assert.equal(verifyRelayEnvelope(envelope, secret, FIXED_NOW_MS + 6 * 60 * 1000), null);
  const badRecipient = await createSignedRelayRequest({ ...record, recipientEmail: "not-an-email" }, secret, FIXED_NOW_MS);
  assert.equal(verifyRelayEnvelope(badRecipient, secret, FIXED_NOW_MS), null);

  let sent = 0;
  const relay = createEmailRelay(async () => { sent += 1; return { messageId: "gmail-1" }; }, {
    EMAIL_RELAY_SECRET: secret,
    SMTP_USER: "studio@gmail.com",
    SMTP_PASS: "test-app-password",
  });
  async function request(method, body) {
    const response = {
      setHeader() {},
      status(value) { this.statusCode = value; return this; },
      json(value) { this.payload = value; return this; },
    };
    await relay({ method, body, headers: {} }, response);
    return response;
  }
  assert.equal((await request("GET", null)).statusCode, 405);
  assert.equal((await request("POST", { ...envelope, signature: "0".repeat(64) })).statusCode, 401);
  assert.equal((await request("POST", "{" )).statusCode, 400);
  assert.equal(sent, 0);
});

test("admin rejects anonymous access, throttles failed logins, and revokes logout sessions", async () => {
  const { state, store } = createFakeStore(bookingFixture());
  let nowMs = FIXED_NOW_MS;
  const api = createWorker({
    storeFactory: () => store,
    nowMs: () => nowMs,
    randomUUID: () => "secure-session-0000000000000001",
  });
  const env = configuredEnv();
  const sessionUrl = "https://example.test/api/admin/session";
  const listUrl = "https://example.test/api/admin/bookings";

  assert.equal((await api.fetch(new Request(sessionUrl), env)).status, 401);
  assert.equal((await api.fetch(new Request(listUrl), env)).status, 401);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await api.fetch(new Request(sessionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.5" },
      body: JSON.stringify({ password: "wrong password" }),
    }), env);
    assert.equal(response.status, 401);
  }

  const blocked = await api.fetch(new Request(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.5" },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }), env);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "900");

  nowMs += 15 * 60 * 1000 + 1;
  const login = await api.fetch(new Request(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.5" },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  assert.equal(state.sessions.size, 1);
  assert.equal((await api.fetch(new Request(listUrl, { headers: { Cookie: cookie } }), env)).status, 200);

  const crossSiteUpdate = await api.fetch(new Request("https://example.test/api/admin/bookings/booking-admin-1", {
    method: "PATCH",
    headers: { Cookie: cookie, Origin: "https://other.example", "Content-Type": "application/json" },
    body: JSON.stringify({ status: "confirmed", adminNotes: "Should not save" }),
  }), env);
  assert.equal(crossSiteUpdate.status, 403);

  const logout = await api.fetch(new Request(sessionUrl, { method: "DELETE", headers: { Cookie: cookie } }), env);
  assert.equal(logout.status, 200);
  assert.equal(state.sessions.size, 0);
  assert.equal((await api.fetch(new Request(listUrl, { headers: { Cookie: cookie } }), env)).status, 401);
});

test("rejects a disguised reference image before saving a booking", async () => {
  const { state, store } = createFakeStore();
  const form = validBookingForm();
  form.append("referenceImages", new File(["not an image"], "reference.png", { type: "image/png" }));
  const api = createWorker({ storeFactory: () => store, now: () => FIXED_NOW });
  const response = await api.fetch(new Request("https://example.test/api/bookings", {
    method: "POST",
    body: form,
  }), configuredEnv({ UPLOADS: {} }));
  assert.equal(response.status, 422);
  assert.equal(state.createdBookings.length, 0);
});

test("local Worker storage persists a booking and private attachment for admin", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rebel-booking-test-"));
  const settings = {
    ADMIN_PASSWORD: "a-local-test-password-only",
    SESSION_SECRET: "a-long-random-local-session-secret-for-test",
    ADMIN_EMAIL: "studio@example.test",
  };
  let env;
  try {
    env = await createDevBindings(root, settings);
    const tasks = [];
    const api = createWorker({ now: () => FIXED_NOW, nowMs: () => FIXED_NOW_MS });
    const form = validBookingForm();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
    form.append("referenceImages", new File([png], "example.png", { type: "image/png" }));
    const created = await api.fetch(new Request("https://example.test/api/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": "local-persistence-test" },
      body: form,
    }), env, { waitUntil(task) { tasks.push(task); } });
    const payload = await created.json();
    assert.equal(created.status, 201);
    await Promise.all(tasks);
    env.DB.close();

    env = await createDevBindings(root, settings);
    const login = await api.fetch(new Request("https://example.test/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: settings.ADMIN_PASSWORD }),
    }), env);
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];
    const detail = await api.fetch(new Request(`https://example.test/api/admin/bookings/${payload.booking.id}`, {
      headers: { Cookie: cookie },
    }), env);
    const booking = (await detail.json()).booking;
    assert.equal(detail.status, 200);
    assert.equal(booking.fullName, "Ama Mensah");
    assert.equal(booking.attachments.length, 1);
    const file = await api.fetch(new Request(`https://example.test/api/admin/bookings/${booking.id}/files/${booking.attachments[0].id}`, {
      headers: { Cookie: cookie },
    }), env);
    assert.equal(file.status, 200);
    assert.equal((await file.arrayBuffer()).byteLength, png.length);
  } finally {
    env?.DB.close();
    await rm(root, { recursive: true, force: true });
  }
});
