function relayUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.username === "" && url.password === "" && !url.search && !url.hash
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function getEmailRelayConfig(env = {}) {
  const url = relayUrl(env.EMAIL_RELAY_URL);
  const secret = String(env.EMAIL_RELAY_SECRET || "");
  return { configured: Boolean(url && secret.length >= 32), url, secret };
}

export async function createSignedRelayRequest(record, secret, nowMs = Date.now()) {
  const timestamp = String(nowMs);
  const payload = JSON.stringify({
    id: record.id,
    to: record.recipientEmail,
    replyTo: record.replyTo || "",
    subject: record.subject,
    text: record.body,
    html: record.html || "",
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  ));
  const signature = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { timestamp, payload, signature };
}
