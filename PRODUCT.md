# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Prospective tattoo clients who want to understand Michelle's work, prepare for an appointment, and submit a detailed booking request.
- The studio administrator/artist, who needs a private operational view of every request, its reference images, status, notes, and email history.

## Product Purpose

Rebel Tattoos presents a calm, considered fine-line tattoo practice and turns a client's idea into a structured booking conversation. Success means clients can submit complete requests confidently and the studio can review, organize, and respond without losing context.

## Positioning

The experience connects an image-led, personal studio portfolio directly to a transparent booking workflow, rather than treating the site and appointment administration as separate products.

## Operating Context

Clients browse the public site, submit a booking request with optional reference images, and expect a response within 2–3 business days. The studio reviews requests in a private dashboard, updates their status, keeps internal notes, and sends contextual replies to the booker, the admin address, or both.

## Capabilities and Constraints

- Separate public Landing, Gallery, FAQ, Artist, and Contact routes must remain available.
- Booking submissions require server-side validation and durable structured storage. Reference images require private object storage.
- The admin surface must not appear in public navigation and all admin data/actions must be protected server-side.
- Email delivery must keep provider credentials on the server. The admin recipient, sender identity, and provider key are deployment configuration, not source-code constants.
- A downloadable ZIP of the complete source is a required delivery artifact.
- Inferred for this build: one studio-admin passphrase protects the dashboard. A future identity-provider decision remains open.

## Brand Commitments

Preserve the Rebel Tattoos name, supplied logo assets, real studio/tattoo imagery, appointment-only language, Barlow Condensed display voice, DM Sans body voice, and the shared rounded-corner/border system. The active gothic palette uses aged parchment, black-plum ink, oxblood, deep violet, antique gold, and pewter.

## Evidence on Hand

- Existing public-site implementation and booking-form content in `src/`.
- Supplied logo, studio, artist, and tattoo imagery in `public/assets/`.
- Existing booking fields and validation in `src/pages/ContactPage.jsx`.
- No real customer bookings, testimonials, pricing, admin email address, sender domain, or email-provider credentials were supplied. Demonstration records must be labeled as sample data and production secrets remain configurable.

## Product Principles

- Keep the public experience personal and reassuring while making the private workspace fast to scan.
- Preserve every detail a client submits; never trade operational clarity for decoration.
- Make booking state and communication history explicit.
- Fail safely: retain the booking even when email delivery fails, and make retry status visible.
- Keep private data and credentials server-side.

## Accessibility & Inclusion

Preserve semantic form labels, keyboard navigation, visible focus, reduced-motion support, descriptive status text that does not rely on color alone, and practical mobile touch targets.
