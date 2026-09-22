export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'needs_reply', 'in_review', 'awaiting_deposit', 'confirmed', 'completed', 'declined')),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    tattoo_idea TEXT NOT NULL,
    placement TEXT NOT NULL,
    approximate_size TEXT NOT NULL,
    style TEXT NOT NULL,
    ink TEXT NOT NULL,
    budget TEXT NOT NULL,
    preferred_date TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    age_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (age_confirmed IN (0, 1)),
    admin_notes TEXT NOT NULL DEFAULT '',
    last_contacted_at TEXT,
    idempotency_key TEXT UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS booking_files (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS booking_emails (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    audience TEXT NOT NULL CHECK (audience IN ('booker', 'admin')),
    recipient_email TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    body_html TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'unconfigured')),
    attempts INTEGER NOT NULL DEFAULT 0,
    provider_message_id TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_status_created_at
    ON bookings(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_booking_files_booking_id
    ON booking_files(booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_booking_emails_booking_created_at
    ON booking_emails(booking_id, created_at DESC)`,
  "PRAGMA optimize",
];

export const BOOKING_STATUSES = [
  "new",
  "needs_reply",
  "in_review",
  "awaiting_deposit",
  "confirmed",
  "completed",
  "declined",
];
