function toBase64(str) {
  const bytes = new TextEncoder().encode(String(str));
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function base64Lines(value) {
  return (toBase64(value).match(/.{1,76}/g) || [""]).join("\r\n");
}

function cleanHeader(value) {
  return String(value || "").replace(/[\r\n\0]+/g, " ").trim();
}

function encodedSubject(value) {
  const subject = cleanHeader(value);
  if (/^[\x20-\x7e]*$/.test(subject) && subject.length <= 70) return subject;
  const chunks = [];
  let current = "";
  for (const character of subject) {
    if (new TextEncoder().encode(current + character).length > 42 && current) {
      chunks.push(`=?UTF-8?B?${toBase64(current)}?=`);
      current = "";
    }
    current += character;
  }
  if (current) chunks.push(`=?UTF-8?B?${toBase64(current)}?=`);
  return chunks.join("\r\n ");
}

function extractEmail(value) {
  const match = String(value || "").match(/<([^<>]+)>/);
  return (match ? match[1] : value).trim();
}

export function buildMimeMessage({ from, to, replyTo, subject, text, html }) {
  const fromAddress = extractEmail(from);
  const domain = fromAddress.split("@")[1]?.toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    throw new Error("A valid sender domain is required.");
  }
  const boundary = `----=_Part_${crypto.randomUUID().replaceAll("-", "")}`;
  const headers = [
    `From: ${cleanHeader(from)}`,
    `To: ${cleanHeader(to)}`,
    ...(replyTo ? [`Reply-To: ${cleanHeader(replyTo)}`] : []),
    `Subject: ${encodedSubject(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(text || ""),
    "",
  ];
  if (html) parts.push(
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(html),
    "",
  );
  parts.push(`--${boundary}--`, "");
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

async function openTlsTransport({ host, port }) {
  // Check if Cloudflare sockets are available
  try {
    const cfSockets = await import("cloudflare:sockets");
    if (cfSockets?.connect) {
      const socket = cfSockets.connect({ hostname: host, port }, { secureTransport: "on" });
      const reader = socket.readable.getReader();
      const writer = socket.writable.getWriter();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let readBuffer = "";

      return {
        async write(data) {
          await writer.write(encoder.encode(data));
        },
        async readLine() {
          while (!readBuffer.includes("\r\n")) {
            const { value, done } = await reader.read();
            if (done) break;
            readBuffer += decoder.decode(value, { stream: true });
          }
          const index = readBuffer.indexOf("\r\n");
          if (index !== -1) {
            const line = readBuffer.slice(0, index);
            readBuffer = readBuffer.slice(index + 2);
            return line;
          }
          const remaining = readBuffer;
          readBuffer = "";
          return remaining;
        },
        async close() {
          try {
            await writer.close();
          } catch {}
          try {
            await socket.close();
          } catch {}
        },
      };
    }
  } catch {}

  // Fallback to Node.js node:tls
  const tls = await import("node:tls");
  return new Promise((resolve, reject) => {
    let resolved = false;
    const socket = tls.connect(port, host, { servername: host }, () => {
      resolved = true;
      let readBuffer = "";
      const lineWaiters = [];

      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        readBuffer += chunk;
        while (readBuffer.includes("\r\n") && lineWaiters.length > 0) {
          const index = readBuffer.indexOf("\r\n");
          const line = readBuffer.slice(0, index);
          readBuffer = readBuffer.slice(index + 2);
          const waiter = lineWaiters.shift();
          waiter.resolve(line);
        }
      });

      socket.on("error", (err) => {
        while (lineWaiters.length > 0) {
          lineWaiters.shift().reject(err);
        }
      });

      socket.on("close", () => {
        while (lineWaiters.length > 0) {
          lineWaiters.shift().reject(new Error("Socket connection closed."));
        }
      });

      resolve({
        async write(data) {
          return new Promise((res, rej) => {
            socket.write(data, (err) => (err ? rej(err) : res()));
          });
        },
        async readLine() {
          const index = readBuffer.indexOf("\r\n");
          if (index !== -1) {
            const line = readBuffer.slice(0, index);
            readBuffer = readBuffer.slice(index + 2);
            return line;
          }
          return new Promise((res, rej) => {
            lineWaiters.push({ resolve: res, reject: rej });
          });
        },
        async close() {
          socket.end();
        },
      });
    });

    socket.on("error", (err) => {
      if (!resolved) reject(err);
    });
  });
}

async function readReply(transport) {
  const lines = [];
  while (true) {
    const line = await transport.readLine();
    if (line === undefined || line === null) break;
    lines.push(line);
    const isMultiLine = line.length >= 4 && line.charAt(3) === "-";
    if (!isMultiLine) break;
  }
  const lastLine = lines[lines.length - 1] || "";
  const code = parseInt(lastLine.slice(0, 3), 10) || 0;
  return { code, lines, lastLine, text: lines.join("\n") };
}

export async function sendSmtpEmail({
  host = "smtp.gmail.com",
  port = 465,
  user,
  pass,
  from,
  to,
  replyTo,
  subject,
  text,
  html,
}) {
  const cleanHost = String(host || "smtp.gmail.com").trim();
  const cleanPort = Number(port) || 465;
  const cleanUser = String(user || "").replace(/[\r\n]/g, "").trim();
  const cleanPass = String(pass || "").replace(/\s+/g, "").trim();
  const fromAddress = extractEmail(from || cleanUser);
  const rcptAddress = extractEmail(to);

  if (!cleanUser || !cleanPass) {
    throw new Error("SMTP credentials missing: username and password required.");
  }
  if (!fromAddress || !rcptAddress) {
    throw new Error("SMTP addresses missing: sender and recipient required.");
  }

  const transport = await openTlsTransport({ host: cleanHost, port: cleanPort });

  try {
    let reply = await readReply(transport);
    if (reply.code !== 220) {
      throw new Error(`SMTP greeting rejected (${reply.code}): ${reply.text}`);
    }

    await transport.write("EHLO localhost\r\n");
    reply = await readReply(transport);
    if (reply.code !== 250) {
      throw new Error(`EHLO command rejected (${reply.code}): ${reply.text}`);
    }

    const authPlain = toBase64(`\0${cleanUser}\0${cleanPass}`);
    await transport.write(`AUTH PLAIN ${authPlain}\r\n`);
    reply = await readReply(transport);
    if (reply.code !== 235) {
      throw new Error(`SMTP authentication failed (${reply.code}): ${reply.text}`);
    }

    await transport.write(`MAIL FROM:<${fromAddress}>\r\n`);
    reply = await readReply(transport);
    if (reply.code !== 250) {
      throw new Error(`MAIL FROM rejected (${reply.code}): ${reply.text}`);
    }

    await transport.write(`RCPT TO:<${rcptAddress}>\r\n`);
    reply = await readReply(transport);
    if (reply.code !== 250) {
      throw new Error(`RCPT TO rejected (${reply.code}): ${reply.text}`);
    }

    await transport.write("DATA\r\n");
    reply = await readReply(transport);
    if (reply.code !== 354) {
      throw new Error(`DATA initiation rejected (${reply.code}): ${reply.text}`);
    }

    await transport.write(buildMimeMessage({ from, to, replyTo, subject, text, html }) + ".\r\n");
    reply = await readReply(transport);
    if (reply.code !== 250) {
      throw new Error(`Email content rejected (${reply.code}): ${reply.text}`);
    }

    await transport.write("QUIT\r\n");
    try {
      await readReply(transport);
    } catch {}

    return { ok: true, providerMessageId: reply.lastLine };
  } finally {
    await transport.close();
  }
}
