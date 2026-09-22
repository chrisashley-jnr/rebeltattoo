import { SCHEMA_STATEMENTS } from "./schema.js";

const schemaReady = new WeakMap();

function bookingFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || "",
    tattooIdea: row.tattoo_idea,
    placement: row.placement,
    size: row.approximate_size,
    style: row.style,
    ink: row.ink,
    budget: row.budget,
    preferredDate: row.preferred_date,
    details: row.details || "",
    ageConfirmed: Boolean(row.age_confirmed),
    adminNotes: row.admin_notes || "",
    lastContactedAt: row.last_contacted_at || null,
    attachmentCount: Number(row.attachment_count || 0),
    failedEmailCount: Number(row.failed_email_count || 0),
  };
}

function fileFromRow(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    name: row.original_name,
    type: row.content_type,
    size: Number(row.byte_size),
    createdAt: row.created_at,
  };
}

function emailFromRow(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    audience: row.audience,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    body: row.body_text,
    status: row.status,
    attempts: Number(row.attempts || 0),
    providerMessageId: row.provider_message_id || null,
    lastError: row.last_error || null,
    createdAt: row.created_at,
    sentAt: row.sent_at || null,
  };
}

async function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    const ready = db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement))).catch((error) => {
      schemaReady.delete(db);
      throw error;
    });
    schemaReady.set(db, ready);
  }
  return schemaReady.get(db);
}

export function createBookingStore(env) {
  if (!env.DB) return null;
  const db = env.DB;
  const uploads = env.UPLOADS || null;

  return {
    async ready() {
      await ensureSchema(db);
    },

    async findByIdempotencyKey(key) {
      if (!key) return null;
      await ensureSchema(db);
      const row = await db.prepare(
        "SELECT * FROM bookings WHERE idempotency_key = ? LIMIT 1",
      ).bind(key).first();
      return bookingFromRow(row);
    },

    async countRecentBookingsByEmail(email, since) {
      await ensureSchema(db);
      const row = await db.prepare(
        "SELECT COUNT(*) AS count FROM bookings WHERE LOWER(email) = LOWER(?) AND created_at >= ?",
      ).bind(email, since).first();
      return Number(row?.count || 0);
    },

    async createBooking(booking, files, emails) {
      await ensureSchema(db);
      const statements = [
        db.prepare(`INSERT INTO bookings (
          id, reference, created_at, updated_at, status, full_name, email, phone,
          tattoo_idea, placement, approximate_size, style, ink, budget,
          preferred_date, details, age_confirmed, admin_notes, last_contacted_at,
          idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            booking.id,
            booking.reference,
            booking.createdAt,
            booking.updatedAt,
            booking.status,
            booking.fullName,
            booking.email,
            booking.phone,
            booking.tattooIdea,
            booking.placement,
            booking.size,
            booking.style,
            booking.ink,
            booking.budget,
            booking.preferredDate,
            booking.details,
            booking.ageConfirmed ? 1 : 0,
            booking.adminNotes,
            booking.lastContactedAt,
            booking.idempotencyKey || null,
          ),
      ];

      for (const file of files) {
        statements.push(
          db.prepare(`INSERT INTO booking_files (
            id, booking_id, object_key, original_name, content_type, byte_size, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(file.id, file.bookingId, file.objectKey, file.name, file.type, file.size, file.createdAt),
        );
      }

      for (const email of emails) {
        statements.push(
          db.prepare(`INSERT INTO booking_emails (
            id, booking_id, audience, recipient_email, subject, body_text, body_html,
            status, attempts, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(
              email.id,
              email.bookingId,
              email.audience,
              email.recipientEmail,
              email.subject,
              email.body,
              email.html || "",
              email.status,
              email.attempts || 0,
              email.createdAt,
            ),
        );
      }

      await db.batch(statements);
      return { ...booking, attachmentCount: files.length, failedEmailCount: 0 };
    },

    async listBookings({ status = "all", query = "" } = {}) {
      await ensureSchema(db);
      const conditions = [];
      const values = [];
      if (status && status !== "all") {
        conditions.push("b.status = ?");
        values.push(status);
      }
      if (query) {
        conditions.push(`(
          LOWER(b.full_name) LIKE ? OR LOWER(b.email) LIKE ? OR
          LOWER(b.reference) LIKE ? OR LOWER(b.tattoo_idea) LIKE ?
        )`);
        const pattern = `%${query.toLowerCase()}%`;
        values.push(pattern, pattern, pattern, pattern);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await db.prepare(`SELECT b.*,
        (SELECT COUNT(*) FROM booking_files f WHERE f.booking_id = b.id) AS attachment_count,
        (SELECT COUNT(*) FROM booking_emails e WHERE e.booking_id = b.id AND e.status = 'failed') AS failed_email_count
        FROM bookings b ${where}
        ORDER BY b.created_at DESC, b.id DESC`)
        .bind(...values)
        .all();
      return (result.results || []).map(bookingFromRow);
    },

    async getBooking(id) {
      await ensureSchema(db);
      const [row, files, emails] = await Promise.all([
        db.prepare(`SELECT b.*,
          (SELECT COUNT(*) FROM booking_files f WHERE f.booking_id = b.id) AS attachment_count,
          (SELECT COUNT(*) FROM booking_emails e WHERE e.booking_id = b.id AND e.status = 'failed') AS failed_email_count
          FROM bookings b WHERE b.id = ? LIMIT 1`).bind(id).first(),
        db.prepare("SELECT * FROM booking_files WHERE booking_id = ? ORDER BY created_at ASC").bind(id).all(),
        db.prepare(`SELECT
          id, booking_id, audience, recipient_email, subject, body_text,
          status, attempts, provider_message_id, last_error, created_at, sent_at
          FROM booking_emails WHERE booking_id = ? ORDER BY created_at DESC`).bind(id).all(),
      ]);
      if (!row) return null;
      return {
        ...bookingFromRow(row),
        attachments: (files.results || []).map(fileFromRow),
        emails: (emails.results || []).map(emailFromRow),
      };
    },

    async updateBooking(id, { status, adminNotes, updatedAt }) {
      await ensureSchema(db);
      const existing = await db.prepare("SELECT id FROM bookings WHERE id = ? LIMIT 1").bind(id).first();
      if (!existing) return null;
      await db.prepare(`UPDATE bookings
        SET status = ?, admin_notes = ?, updated_at = ?
        WHERE id = ?`)
        .bind(status, adminNotes, updatedAt, id)
        .run();
      return this.getBooking(id);
    },

    async addEmails(records) {
      await ensureSchema(db);
      if (!records.length) return [];
      await db.batch(records.map((email) => db.prepare(`INSERT INTO booking_emails (
        id, booking_id, audience, recipient_email, subject, body_text, body_html,
        status, attempts, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          email.id,
          email.bookingId,
          email.audience,
          email.recipientEmail,
          email.subject,
          email.body,
          email.html || "",
          email.status,
          email.attempts || 0,
          email.createdAt,
        )));
      return records;
    },

    async updateEmailResult(id, result) {
      await ensureSchema(db);
      await db.prepare(`UPDATE booking_emails
        SET status = ?, attempts = attempts + ?, provider_message_id = ?,
            last_error = ?, sent_at = ?
        WHERE id = ?`)
        .bind(
          result.status,
          result.attempted ? 1 : 0,
          result.providerMessageId || null,
          result.error || null,
          result.sentAt || null,
          id,
        )
        .run();
      if (result.status === "sent" && result.audience === "booker" && result.bookingId) {
        await db.prepare("UPDATE bookings SET last_contacted_at = ?, updated_at = ? WHERE id = ?")
          .bind(result.sentAt, result.sentAt, result.bookingId)
          .run();
      }
    },

    async putFile(file) {
      if (!uploads) throw new Error("Reference-image storage is not configured.");
      await uploads.put(file.objectKey, file.body, {
        httpMetadata: { contentType: file.type },
        customMetadata: { originalName: file.name, bookingId: file.bookingId },
      });
    },

    async deleteFile(objectKey) {
      if (uploads) await uploads.delete(objectKey);
    },

    async readFile(objectKey) {
      if (!uploads) return null;
      return uploads.get(objectKey);
    },

    async readBookingFile(bookingId, fileId) {
      await ensureSchema(db);
      const row = await db.prepare(
        "SELECT * FROM booking_files WHERE booking_id = ? AND id = ? LIMIT 1",
      ).bind(bookingId, fileId).first();
      if (!row || !uploads) return null;
      const object = await uploads.get(row.object_key);
      return object ? { file: fileFromRow(row), object } : null;
    },
  };
}
