function toBase64(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(str)));
}

function escapeDots(text = "") {
  return String(text).replace(/\r?\n\./g, "\r\n..");
}

function extractEmail(value) {
  const match = String(value || "").match(/<([^<>]+)>/);
  return (match ? match[1] : value).trim();
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

    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const headerLines = [
      `From: ${from}`,
      `To: ${to}`,
      ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@rebeltattoos>`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];

    const rawBody = [
      headerLines.join("\r\n"),
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeDots(text || ""),
      "",
      ...(html
        ? [
            `--${boundary}`,
            "Content-Type: text/html; charset=UTF-8",
            "Content-Transfer-Encoding: 8bit",
            "",
            escapeDots(html),
            "",
          ]
        : []),
      `--${boundary}--`,
      "",
    ].join("\r\n");

    await transport.write(rawBody + ".\r\n");
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
