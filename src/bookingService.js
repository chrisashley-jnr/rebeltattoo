// Set to false for live production mode with active API and Gmail SMTP delivery.
// Set import.meta.env.VITE_DEMO_MODE === "true" if offline preview is needed.
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

export const statusOptions = [
  { value: "all", label: "All bookings" },
  { value: "new", label: "New" },
  { value: "needs_reply", label: "Needs reply" },
  { value: "in_review", label: "In review" },
  { value: "awaiting_deposit", label: "Awaiting deposit" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
];

const DEMO_PASSWORD = "rebel-demo";
const DEMO_SESSION_KEY = "rebel-tattoos:admin-session";
const DEMO_BOOKINGS_KEY = "rebel-tattoos:bookings:v2";

function formatReference(date, id) {
  return `RT-${date.slice(0, 10).replaceAll("-", "")}-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function demoEmail({ id, bookingId, audience, subject, body, createdAt, status = "unconfigured" }) {
  return {
    id,
    bookingId,
    audience,
    recipientEmail: audience === "admin" ? "michelle@rebel-tattoos.example" : "sample.booker@example.com",
    subject,
    body,
    status,
    attempts: 0,
    providerMessageId: null,
    lastError: status === "unconfigured" ? "Local demo — no email was delivered." : null,
    createdAt,
    sentAt: null,
  };
}

function buildDemoBookings() {
  const now = Date.now();
  const created = (hoursAgo) => new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "demo-botanical",
      reference: "RT-DEMO-1042",
      createdAt: created(3),
      updatedAt: created(3),
      status: "new",
      fullName: "Sample — Naa",
      email: "sample.naa@example.com",
      phone: "+233 20 000 1042",
      tattooIdea: "A fine-line climbing vine with two small flowers representing family milestones. I would like the movement to follow the natural line of my forearm.",
      placement: "Forearm",
      size: "Hand-sized",
      style: "Botanical",
      ink: "Black ink",
      budget: "GHS 1,000–2,500",
      preferredDate: new Date(now + 14 * 86400000).toISOString().slice(0, 10),
      details: "First tattoo. I would appreciate a little extra time to talk through placement before we begin.",
      ageConfirmed: true,
      adminNotes: "",
      lastContactedAt: null,
      attachmentCount: 2,
      failedEmailCount: 0,
      attachments: [
        { id: "demo-file-1", bookingId: "demo-botanical", name: "vine-reference.jpg", type: "image/jpeg", size: 684000, createdAt: created(3), available: false },
        { id: "demo-file-2", bookingId: "demo-botanical", name: "placement-reference.png", type: "image/png", size: 422000, createdAt: created(3), available: false },
      ],
      emails: [demoEmail({ id: "demo-email-1", bookingId: "demo-botanical", audience: "booker", subject: "We received your Rebel Tattoos request — RT-DEMO-1042", body: "Local demo confirmation preview.", createdAt: created(3) })],
    },
    {
      id: "demo-celestial",
      reference: "RT-DEMO-1038",
      createdAt: created(28),
      updatedAt: created(20),
      status: "needs_reply",
      fullName: "Sample — Kojo",
      email: "sample.kojo@example.com",
      phone: "",
      tattooIdea: "A small celestial piece with a crescent moon and three imperfect stars. I like quiet, delicate linework rather than heavy shading.",
      placement: "Upper arm",
      size: "Palm-sized",
      style: "Fine line",
      ink: "Black ink",
      budget: "Under GHS 1,000",
      preferredDate: new Date(now + 21 * 86400000).toISOString().slice(0, 10),
      details: "Happy to take the artist’s guidance on the final arrangement.",
      ageConfirmed: true,
      adminNotes: "Reply with two available consultation times.",
      lastContactedAt: null,
      attachmentCount: 0,
      failedEmailCount: 0,
      attachments: [],
      emails: [],
    },
    {
      id: "demo-heron",
      reference: "RT-DEMO-1027",
      createdAt: created(96),
      updatedAt: created(48),
      status: "confirmed",
      fullName: "Sample — Abena",
      email: "sample.abena@example.com",
      phone: "+233 24 000 1027",
      tattooIdea: "A heron surrounded by reeds, drawn with a mix of fine line and a few confident blackwork shapes.",
      placement: "Calf",
      size: "Larger piece",
      style: "Illustrative",
      ink: "Black ink",
      budget: "GHS 2,500–5,000",
      preferredDate: new Date(now + 35 * 86400000).toISOString().slice(0, 10),
      details: "Deposit received in this illustrative local example.",
      ageConfirmed: true,
      adminNotes: "Illustrative booking — session held for the preferred week.",
      lastContactedAt: created(48),
      attachmentCount: 1,
      failedEmailCount: 0,
      attachments: [
        { id: "demo-file-3", bookingId: "demo-heron", name: "heron-moodboard.jpg", type: "image/jpeg", size: 912000, createdAt: created(96), available: false },
      ],
      emails: [demoEmail({ id: "demo-email-3", bookingId: "demo-heron", audience: "booker", subject: "Your Rebel Tattoos booking next step", body: "Illustrative email history item — not delivered.", createdAt: created(48) })],
    },
  ];
}

function readDemoBookings() {
  const saved = window.sessionStorage.getItem(DEMO_BOOKINGS_KEY);
  if (saved) {
    try {
      const bookings = JSON.parse(saved);
      if (Array.isArray(bookings)) return bookings;
    } catch {
      window.sessionStorage.removeItem(DEMO_BOOKINGS_KEY);
    }
  }
  const bookings = buildDemoBookings();
  writeDemoBookings(bookings);
  return bookings;
}

function writeDemoBookings(bookings) {
  window.sessionStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify(bookings));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Something went wrong. Please try again.");
    error.status = response.status;
    error.fields = payload.fields || {};
    throw error;
  }
  return payload;
}

export async function submitBooking(values, files = []) {
  if (isDemoMode) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const reference = formatReference(now, id);
    const booking = {
      id,
      reference,
      createdAt: now,
      updatedAt: now,
      status: "new",
      ...values,
      fullName: values.fullName.trim(),
      email: values.email.trim().toLowerCase(),
      adminNotes: "",
      lastContactedAt: null,
      attachmentCount: files.length,
      failedEmailCount: 0,
      attachments: files.map((file) => ({
        id: crypto.randomUUID(),
        bookingId: id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: now,
        available: false,
      })),
      emails: [
        demoEmail({
          id: crypto.randomUUID(),
          bookingId: id,
          audience: "booker",
          subject: `We received your Rebel Tattoos request — ${reference}`,
          body: "Local demo confirmation preview — no email was delivered.",
          createdAt: now,
        }),
        demoEmail({
          id: crypto.randomUUID(),
          bookingId: id,
          audience: "admin",
          subject: `New booking ${reference}`,
          body: "Local demo booking notification preview — no email was delivered.",
          createdAt: now,
        }),
      ],
    };
    writeDemoBookings([booking, ...readDemoBookings()]);
    return { booking, notifications: "demo" };
  }

  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value === true ? "true" : String(value ?? ""));
  for (const file of files) form.append("referenceImages", file, file.name);
  const idempotencyKey = crypto.randomUUID();
  return apiRequest("/api/bookings", {
    method: "POST",
    body: form,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function getAdminSession() {
  if (isDemoMode) {
    if (window.sessionStorage.getItem(DEMO_SESSION_KEY) !== "active") {
      const error = new Error("Sign in to access the booking dashboard.");
      error.status = 401;
      throw error;
    }
    return {
      authenticated: true,
      adminEmail: "michelle@rebel-tattoos.example",
      emailConfigured: false,
    };
  }
  return apiRequest("/api/admin/session");
}

export async function loginAdmin(password) {
  if (isDemoMode) {
    if (password !== DEMO_PASSWORD) {
      const error = new Error("That password is not correct. Use the demo password shown below.");
      error.status = 401;
      throw error;
    }
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    return { authenticated: true };
  }
  return apiRequest("/api/admin/session", { method: "POST", body: JSON.stringify({ password }) });
}

export async function logoutAdmin() {
  if (isDemoMode) {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    return { authenticated: false };
  }
  return apiRequest("/api/admin/session", { method: "DELETE" });
}

export async function listBookings({ status = "all", query = "" } = {}) {
  if (isDemoMode) {
    const normalizedQuery = query.trim().toLowerCase();
    const bookings = readDemoBookings().filter((booking) => {
      const matchesStatus = status === "all" || booking.status === status;
      const matchesQuery = !normalizedQuery || [booking.fullName, booking.email, booking.reference, booking.tattooIdea]
        .some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      return matchesStatus && matchesQuery;
    });
    return { bookings, statuses: statusOptions.filter((option) => option.value !== "all").map((option) => option.value) };
  }
  const parameters = new URLSearchParams({ status, ...(query ? { q: query } : {}) });
  return apiRequest(`/api/admin/bookings?${parameters}`);
}

export async function getBooking(id) {
  if (isDemoMode) {
    const booking = readDemoBookings().find((item) => item.id === id);
    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }
    return { booking };
  }
  return apiRequest(`/api/admin/bookings/${encodeURIComponent(id)}`);
}

export async function updateBooking(id, update) {
  if (isDemoMode) {
    let updated;
    const bookings = readDemoBookings().map((booking) => {
      if (booking.id !== id) return booking;
      updated = { ...booking, ...update, updatedAt: new Date().toISOString() };
      return updated;
    });
    if (!updated) throw new Error("Booking not found.");
    writeDemoBookings(bookings);
    return { booking: updated };
  }
  return apiRequest(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function sendBookingEmail(id, draft) {
  if (isDemoMode) {
    const createdAt = new Date().toISOString();
    let createdEmails = [];
    const bookings = readDemoBookings().map((booking) => {
      if (booking.id !== id) return booking;
      const audiences = draft.audience === "both" ? ["booker", "admin"] : [draft.audience];
      createdEmails = audiences.map((audience) => demoEmail({
        id: crypto.randomUUID(),
        bookingId: id,
        audience,
        subject: draft.subject,
        body: draft.body,
        createdAt,
      }));
      return { ...booking, emails: [...createdEmails, ...(booking.emails || [])], updatedAt: createdAt };
    });
    if (!createdEmails.length) throw new Error("Booking not found.");
    writeDemoBookings(bookings);
    return { emails: createdEmails, demo: true };
  }
  return apiRequest(`/api/admin/bookings/${encodeURIComponent(id)}/emails`, {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export function getAttachmentUrl(bookingId, fileId) {
  if (isDemoMode) return null;
  return `/api/admin/bookings/${encodeURIComponent(bookingId)}/files/${encodeURIComponent(fileId)}`;
}
