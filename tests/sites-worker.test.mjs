import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  renderBookingConfirmationEmail,
  renderManualEmail,
} from "../worker/email-template.js";
import worker, { createWorker } from "../worker/index.js";

const FIXED_NOW = "2026-09-22T12:00:00.000Z";
const FIXED_NOW_MS = Date.parse(FIXED_NOW);

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
  };

  const store = {
    async ready() {},
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

test("falls back to index.html for an unknown app route", async () => {
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
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
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
    randomUUID: createIdFactory(["manual-booker-email", "manual-admin-email"]),
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
    randomUUID: createIdFactory(["partial-booker-email", "partial-admin-email"]),
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
  ];
  await Promise.all(requiredOutputs.map((path) => access(new URL(path, import.meta.url))));

  const hosting = JSON.parse(await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../dist/.openai/drizzle/0000_booking_admin.sql", import.meta.url), "utf8");
  const emailMigration = await readFile(new URL("../dist/.openai/drizzle/0001_email_html.sql", import.meta.url), "utf8");
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "UPLOADS");
  if (hosting.project_id !== undefined) assert.equal(typeof hosting.project_id, "string");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS bookings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS booking_files/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS booking_emails/);
  assert.match(emailMigration, /ADD COLUMN body_html/);
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
