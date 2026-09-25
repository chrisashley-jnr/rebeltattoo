# Rebel Tattoos website

A responsive multi-page booking website for Rebel Tattoos, including Home, Gallery, FAQ, Artist, Contact, and a private Admin dashboard.

## Run the project

1. Install dependencies with `npm install`.
2. Start the local site with `npm run dev`.
3. Open the local URL shown in the terminal.

The local preview uses the same booking and admin API as production, backed by a private SQLite database and upload directory in `.local-data/`. Put a unique `ADMIN_PASSWORD` (at least 12 characters) and `SESSION_SECRET` (at least 32 characters) in an untracked `.dev.vars` file, then submit a request at `/booking` and sign in at `/admin`. If SMTP or Resend credentials are present, local bookings send real emails. Without them, the dashboard shows that delivery is not configured.

For an offline sample-data preview, start Vite with `VITE_DEMO_MODE=true`. That mode is only available during development and labels its sample records and messages.

## Production features

- Booking details are stored in D1.
- Reference images are stored privately in R2 and are only served through authenticated admin routes.
- `/admin` uses an eight-hour signed, HTTP-only, same-site session cookie. Sessions are checked against storage and revoked on sign-out. Sign-in is rate limited, and admin writes require the same origin.
- Automatic booking acknowledgements and dashboard-composed emails use the signed Gmail relay or Resend when configured. Every message includes a responsive, branded HTML design plus a complete plain-text fallback.
- The public form is validated on both the page and server, includes a honeypot, caps file type/size/count, and rate-limits repeated submissions by email.

## Production configuration

Set hosted runtime values in the Site's settings. Use `.dev.vars.example` for local development and as a list of keys:

- `ADMIN_PASSWORD`: private dashboard password.
- `SESSION_SECRET`: a long random signing secret.
- `ADMIN_EMAIL`: the studio inbox that receives booking alerts (e.g. `rebeltattoo101@gmail.com`).
- `EMAIL_RELAY_URL`: `https://rebeltattoo.vercel.app/api/email-relay` for Gmail sending through Vercel.
- `EMAIL_RELAY_SECRET`: the same random secret (at least 32 characters) on Sites and Vercel.
- `EMAIL_FROM` and `RESEND_API_KEY`: alternative Resend settings that require a verified sending domain.
- `SMTP_USER`, `SMTP_PASS`, and `SMTP_HOST`: optional Gmail SMTP settings for local development only.
- `PUBLIC_SITE_URL`: final public site URL, used in admin notification links.

Use a public HTTPS address for `PUBLIC_SITE_URL`. Localhost links are omitted from outgoing messages. Sites does not support raw SMTP sockets. To send from Gmail without a custom domain, configure the signed HTTPS relay on the existing Vercel project with `SMTP_USER=rebeltattoo101@gmail.com`, a Gmail app password in `SMTP_PASS`, and the same `EMAIL_RELAY_SECRET` as Sites. Keep these credentials in server environment settings, never in frontend code. The relay accepts only fresh HMAC-signed requests and always sends from the configured Gmail account. Gmail still applies sending limits, and no sender can guarantee placement in the main inbox. For the Resend alternative, configure the SPF, DKIM, and DMARC records required by the mail provider.

Deploy the Sites build with its `DB` (D1) and `UPLOADS` (R2) bindings and apply every migration in `.openai/drizzle`, including `0002_admin_security.sql`. The Vercel deployment redirects visitors to the Sites deployment, where bookings can be persisted for the dashboard. Do not place real credentials in frontend code or commit them to the project. Without email credentials, bookings are still saved and the dashboard remains usable; email records are marked as not configured instead of pretending they were sent.

## Useful commands

- `npm run dev` — local preview
- `npm run build` — production/Sites build
- `npm run test:sites` — worker and API tests

Database migrations are in `.openai/drizzle`, and the production Worker entry is `worker/index.js`.

## Booking emails

Customer confirmations mirror the website's gothic aged-parchment, black-plum, oxblood, deep-violet, antique-gold, and pewter system with the same shared 10px/16px corners. They include the booking reference, request summary, response window, next steps, and a gallery link. Studio alerts remain intentionally brief and link to the protected dashboard for full private details. Dynamic booking content is escaped before it is added to HTML, and the text version remains available for inboxes that do not display HTML.
