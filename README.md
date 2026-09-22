# Rebel Tattoos website

A responsive multi-page booking website for Rebel Tattoos, including Home, Gallery, FAQ, Artist, Contact, and a private Admin dashboard.

## Run the project

1. Install dependencies with `npm install`.
2. Start the local site with `npm run dev`.
3. Open the local URL shown in the terminal.

The local preview uses clearly labeled sample data so the complete flow can be reviewed without connecting external services. Submit the Contact form, then open `/admin` and use the displayed demo password: `rebel-demo`.

## Production features

- Booking details are stored in D1.
- Reference images are stored privately in R2 and are only served through authenticated admin routes.
- `/admin` uses an expiring signed, HTTP-only session cookie.
- Automatic booking acknowledgements and dashboard-composed emails use Resend when configured. Every message includes a responsive, branded HTML design plus a complete plain-text fallback.
- The public form is validated on both the page and server, includes a honeypot, caps file type/size/count, and rate-limits repeated submissions by email.

## Production configuration

Use `.dev.vars.example` as the list of required settings:

- `ADMIN_PASSWORD`: private dashboard password.
- `SESSION_SECRET`: a long random signing secret.
- `ADMIN_EMAIL`: the studio inbox that receives booking alerts (e.g. `rebeltattoo101@gmail.com`).
- `EMAIL_FROM`: sender address, e.g. `Rebel Tattoos <rebeltattoo101@gmail.com>`.
- `SMTP_USER`: Gmail address (e.g. `rebeltattoo101@gmail.com`).
- `SMTP_PASS`: 16-character Google App Password.
- `SMTP_HOST`: `smtp.gmail.com` (port 465 SSL).
- `RESEND_API_KEY`: alternative email provider API key (if using Resend instead of Gmail SMTP).
- `PUBLIC_SITE_URL`: final public site URL, used in admin notification links.

Do not place real credentials in frontend code or commit them to the project. Without email credentials, bookings are still saved and the dashboard remains usable; email records are marked as not configured instead of pretending they were sent.

## Useful commands

- `npm run dev` — local preview
- `npm run build` — production/Sites build
- `npm run test:sites` — worker and API tests

Database migrations are in `.openai/drizzle`, and the production Worker entry is `worker/index.js`.

## Booking emails

Customer confirmations mirror the website's gothic aged-parchment, black-plum, oxblood, deep-violet, antique-gold, and pewter system with the same shared 10px/16px corners. They include the booking reference, request summary, response window, next steps, and a gallery link. Studio alerts remain intentionally brief and link to the protected dashboard for full private details. Dynamic booking content is escaped before it is added to HTML, and the text version remains available for inboxes that do not display HTML.
