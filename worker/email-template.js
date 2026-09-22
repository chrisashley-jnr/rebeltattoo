const palette = {
  paper: "#f3eee6",
  surface: "#e8e0d6",
  ink: "#171319",
  muted: "#625b62",
  border: "#87757f",
  cobalt: "#4b2a50",
  cobaltDark: "#321a38",
  cobaltSoft: "#e5d9e6",
  orange: "#741f3a",
  inverse: "#fffaf3",
  inverseMuted: "#c8bbc2",
};

export function escapeEmailHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeSiteUrl(env, pathname = "") {
  try {
    const base = new URL(String(env.PUBLIC_SITE_URL || ""));
    const url = new URL(pathname || "/", `${base.origin}/`);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return String(value || "To be confirmed");
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function shorten(value, max = 320) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function paragraphHtml(value) {
  return escapeEmailHtml(value).replace(/\r?\n/g, "<br>");
}

function detailRow(label, value, final = false) {
  return `
    <tr>
      <td style="padding:12px 0;${final ? "" : `border-bottom:1px solid ${palette.border};`}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="detail-label" width="34%" valign="top" style="padding:0 16px 0 0;color:${palette.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:18px;text-transform:uppercase;letter-spacing:0.7px;">${escapeEmailHtml(label)}</td>
            <td class="detail-value" valign="top" style="padding:0;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;line-height:21px;overflow-wrap:anywhere;">${escapeEmailHtml(value || "—")}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function stepRow(number, title, copy, final = false) {
  return `
    <tr>
      <td valign="top" width="42" style="padding:${final ? "14px" : "14px 0"} 0;${final ? "" : `border-bottom:1px solid ${palette.border};`}">
        <div style="width:30px;height:30px;border:1px solid ${palette.cobalt};border-radius:10px;background:${palette.cobaltSoft};color:${palette.cobaltDark};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:30px;text-align:center;">${number}</div>
      </td>
      <td valign="top" style="padding:${final ? "14px" : "14px 0"} 0;${final ? "" : `border-bottom:1px solid ${palette.border};`}">
        <p style="margin:0;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:20px;">${escapeEmailHtml(title)}</p>
        <p style="margin:3px 0 0;color:${palette.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">${escapeEmailHtml(copy)}</p>
      </td>
    </tr>`;
}

function emailFrame({ preheader, title, intro, content, cta, footerNote }) {
  const ctaMarkup = cta?.url ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
      <tr>
        <td style="border-radius:10px;background:${palette.cobalt};">
          <a href="${escapeEmailHtml(cta.url)}" style="display:inline-block;padding:14px 22px;border:1px solid ${palette.cobalt};border-radius:10px;color:${palette.inverse};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:18px;text-decoration:none;">${escapeEmailHtml(cta.label)}</a>
        </td>
      </tr>
    </table>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeEmailHtml(title)}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .email-shell { width: 100% !important; }
        .email-pad { padding-left: 22px !important; padding-right: 22px !important; }
        .email-title { font-size: 36px !important; line-height: 38px !important; }
        .detail-label, .detail-value { display: block !important; width: 100% !important; }
        .detail-label { padding: 0 0 3px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${palette.surface};color:${palette.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;">${escapeEmailHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.surface}" style="width:100%;background:${palette.surface};">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table class="email-shell" role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.paper}" style="width:100%;max-width:640px;border:1px solid ${palette.border};border-collapse:separate;border-radius:16px;overflow:hidden;background:${palette.paper};">
            <tr><td style="height:8px;background:${palette.cobalt};font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td class="email-pad" style="padding:28px 34px 24px;border-bottom:1px solid ${palette.border};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;line-height:22px;letter-spacing:1.5px;">REBEL TATTOOS</td>
                    <td align="right" valign="middle"><span style="display:inline-block;width:28px;height:5px;border-radius:3px;background:${palette.orange};font-size:0;line-height:0;">&nbsp;</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:38px 34px 36px;">
                <h1 class="email-title" style="margin:0;color:${palette.ink};font-family:Arial Narrow,Arial,Helvetica,sans-serif;font-size:44px;font-weight:800;line-height:46px;letter-spacing:-1px;text-transform:uppercase;">${escapeEmailHtml(title)}</h1>
                <p style="max-width:520px;margin:18px 0 0;color:${palette.muted};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;">${intro}</p>
                ${content}
                ${ctaMarkup}
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:24px 34px;border-top:1px solid ${palette.border};background:${palette.ink};">
                <p style="margin:0;color:${palette.inverse};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:20px;">Fine-line tattooing with softness, movement, and meaning.</p>
                <p style="margin:7px 0 0;color:${palette.inverseMuted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">${escapeEmailHtml(footerNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderBookingConfirmationEmail(booking, env) {
  const galleryUrl = safeSiteUrl(env, "/gallery");
  const content = `
    <div style="margin:26px 0 0;padding:14px 16px;border:1px solid ${palette.border};border-radius:10px;background:${palette.cobaltSoft};">
      <p style="margin:0;color:${palette.cobaltDark};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;line-height:16px;letter-spacing:0.8px;text-transform:uppercase;">Booking reference</p>
      <p style="margin:3px 0 0;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:800;line-height:22px;letter-spacing:0.3px;">${escapeEmailHtml(booking.reference)}</p>
    </div>
    <p style="margin:28px 0 0;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;">Hi ${escapeEmailHtml(booking.fullName)},</p>
    <p style="margin:10px 0 0;color:${palette.muted};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;">Thanks for sharing your idea. Michelle will review the request and reply with timing, pricing, and the clearest next step within 2–3 business days.</p>
    <div style="margin:28px 0 0;padding:20px;border:1px solid ${palette.border};border-radius:16px;background:${palette.surface};">
      <p style="margin:0 0 8px;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;line-height:20px;text-transform:uppercase;letter-spacing:0.6px;">Your request</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("Idea", shorten(booking.tattooIdea))}
        ${detailRow("Placement", booking.placement)}
        ${detailRow("Size", booking.size)}
        ${detailRow("Style", booking.style)}
        ${detailRow("Preferred date", formatDate(booking.preferredDate), true)}
      </table>
    </div>
    <div style="margin:28px 0 0;">
      <p style="margin:0;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;line-height:20px;text-transform:uppercase;letter-spacing:0.6px;">What happens next</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
        ${stepRow("1", "Your brief is reviewed", "Michelle checks the idea, size, placement, and reference images.")}
        ${stepRow("2", "You receive a clear reply", "Expect availability, an estimate, and any useful design questions by email.")}
        ${stepRow("3", "Your appointment is secured", "The date becomes final after design approval and deposit.", true)}
      </table>
    </div>
    <div style="margin:28px 0 0;padding:16px;border:1px solid ${palette.border};border-radius:10px;background:${palette.paper};">
      <p style="margin:0;color:${palette.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;"><strong style="color:${palette.ink};">A quick note:</strong> this request starts the conversation; it does not confirm an appointment yet.</p>
    </div>`;

  return emailFrame({
    preheader: `We received your Rebel Tattoos request ${booking.reference}.`,
    title: "Your idea is in.",
    intro: "Your booking request reached Michelle safely. Keep this email for your reference while the details are reviewed.",
    content,
    cta: galleryUrl ? { label: "Explore the gallery", url: galleryUrl } : null,
    footerNote: "Reply to this email if you need to add a small detail before your request is reviewed.",
  });
}

export function renderAdminBookingEmail(booking, env) {
  const adminUrl = safeSiteUrl(env, `/admin?booking=${encodeURIComponent(booking.id)}`);
  const content = `
    <div style="margin:26px 0 0;padding:20px;border:1px solid ${palette.border};border-radius:16px;background:${palette.surface};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("Reference", booking.reference)}
        ${detailRow("Booker", booking.fullName)}
        ${detailRow("Email", booking.email)}
        ${detailRow("Preferred date", formatDate(booking.preferredDate), true)}
      </table>
    </div>
    <p style="margin:18px 0 0;color:${palette.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">The full brief, private notes, and reference images stay inside the protected booking dashboard.</p>`;

  return emailFrame({
    preheader: `New booking ${booking.reference} from ${booking.fullName}.`,
    title: "New booking request.",
    intro: "A new home service request is ready for review.",
    content,
    cta: adminUrl ? { label: "Review the booking", url: adminUrl } : null,
    footerNote: "Private booking notification — keep booking details inside the protected dashboard.",
  });
}

export function renderManualEmail({ booking, audience, subject, body, env }) {
  const isBooker = audience === "booker";
  const destinationUrl = isBooker
    ? safeSiteUrl(env, "/gallery")
    : safeSiteUrl(env, `/admin?booking=${encodeURIComponent(booking.id)}`);
  const content = `
    <div style="margin:26px 0 0;padding:14px 16px;border:1px solid ${palette.border};border-radius:10px;background:${palette.cobaltSoft};">
      <p style="margin:0;color:${palette.cobaltDark};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;line-height:16px;letter-spacing:0.8px;text-transform:uppercase;">Booking reference</p>
      <p style="margin:3px 0 0;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;line-height:21px;">${escapeEmailHtml(booking.reference)}</p>
    </div>
    <p style="margin:28px 0 0;color:${palette.ink};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;">${isBooker ? `Hi ${escapeEmailHtml(booking.fullName)},` : `Booking for ${escapeEmailHtml(booking.fullName)}`}</p>
    <div style="margin:14px 0 0;color:${palette.muted};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;">${paragraphHtml(shorten(body, 12000))}</div>`;

  return emailFrame({
    preheader: shorten(body, 110),
    title: shorten(subject, 180),
    intro: isBooker ? "A note from Michelle at Rebel Tattoos." : "A copy of this booking message.",
    content,
    cta: destinationUrl ? {
      label: isBooker ? "Visit Rebel Tattoos" : "Open the booking",
      url: destinationUrl,
    } : null,
    footerNote: isBooker
      ? "Reply to this email to continue the conversation with Michelle."
      : "Private copy for the booking record.",
  });
}
