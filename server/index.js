const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const PORT = process.env.PORT || 8080;

app.use(express.static("public"));
app.use(express.json());

const clients = new Map();

function logInfo(message, meta) {
  const payload = {
    type: "log",
    level: "info",
    message,
    timestamp: Date.now(),
    meta: meta || null,
  };
  console.log(`[info] ${message}`, meta || "");
  broadcastToMonitors(payload);
}

function logError(message, meta) {
  const payload = {
    type: "log",
    level: "error",
    message,
    timestamp: Date.now(),
    meta: meta || null,
  };
  console.error(`[error] ${message}`, meta || "");
  broadcastToMonitors(payload);
}

function broadcastToMonitors(payload) {
  const data = JSON.stringify(payload);
  for (const [ws, info] of clients.entries()) {
    if (info.role === "monitor" && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

function broadcastCommand(command) {
  // Stub for future command broadcasting. No default behavior.
  logInfo("command broadcast stub", { command });
}

wss.on("connection", (ws, req) => {
  let role = "device";
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.searchParams.get("role") === "monitor") {
      role = "monitor";
    }
  } catch (error) {
    // Ignore URL parse errors and default to device.
  }

  clients.set(ws, { role });
  logInfo("connected", { role });

  ws.on("message", (data) => {
    const text = data.toString();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      logError("invalid payload", { role, payload: text });
      return;
    }

    // 모니터링 메시지 타입 처리 (motor, steering, arm)
    if (parsed && ["motor", "steering", "arm"].includes(parsed.type)) {
      broadcastToMonitors(parsed);
      logInfo("monitoring data received", { type: parsed.type });
    } else {
      logInfo("message received", { role, payload: text });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    logInfo("disconnected", { role });
  });

  ws.on("error", (error) => {
    logError("socket error", { role, error: error.message });
  });
});

app.post("/command", (req, res) => {
  broadcastCommand(req.body || null);
  res.status(202).json({ status: "accepted" });
});

server.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});
