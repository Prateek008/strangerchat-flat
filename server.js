import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.set("trust proxy", true);
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e4 }); // text only, 10KB max

/* ---------- optional MongoDB (only for reports) ---------- */
let Report = null;
if (process.env.MONGO_URI) {
  try {
    const { default: mongoose } = await import("mongoose");
    await mongoose.connect(process.env.MONGO_URI);
    Report = mongoose.model(
      "Report",
      new mongoose.Schema({
        reason: String,
        note: String,
        reportedIp: String,
        reporterIp: String,
        createdAt: { type: Date, default: Date.now },
      })
    );
    console.log("MongoDB connected (reports will be saved)");
  } catch (e) {
    console.warn("MongoDB skipped:", e.message);
  }
}

/* ---------- state ---------- */
const waiting = [];                 // sockets waiting for a partner
const partners = new Map();         // socket.id -> partner socket
const bans = new Map();             // ip -> banned-until timestamp
const reports = new Map();          // ip -> Map(reporterIp -> timestamp)
const BAN_MS = 24 * 60 * 60 * 1000;
const REPORTS_TO_BAN = 3;

const BAD_WORDS = ["fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy", "slut", "whore", "nigger", "chutiya", "madarchod", "behenchod", "bhosdi", "randi", "gandu", "harami"];
const badRe = new RegExp(`\\b(${BAD_WORDS.join("|")})\\b`, "gi");
const urlRe = /(https?:\/\/|www\.)\S+|\b\S+\.(com|net|org|in|io|me|xyz|ly)\b\S*/gi;

const clean = (t) =>
  t.replace(urlRe, "[link removed]").replace(badRe, (m) => "*".repeat(m.length));

const getIp = (s) =>
  (s.handshake.headers["x-forwarded-for"] || s.handshake.address || "").split(",")[0].trim();

const sanitizeName = (n) => {
  const v = String(n || "").replace(/[<>]/g, "").trim().slice(0, 20);
  return v || "Stranger";
};

const broadcastOnline = () => io.emit("online", io.engine.clientsCount);

function unlink(socket, notify = true) {
  const i = waiting.indexOf(socket);
  if (i !== -1) waiting.splice(i, 1);
  const p = partners.get(socket.id);
  if (p) {
    partners.delete(socket.id);
    partners.delete(p.id);
    socket.data.last = p;
    p.data.last = socket;
    if (notify) p.emit("partner_left");
  }
}

function pair(socket) {
  const idx = waiting.findIndex(
    (s) => s.connected && s.id !== socket.id && s !== socket.data.last && s.data.last !== socket
  );
  if (idx === -1) {
    if (!waiting.includes(socket)) waiting.push(socket);
    socket.emit("waiting");
    return;
  }
  const other = waiting.splice(idx, 1)[0];
  partners.set(socket.id, other);
  partners.set(other.id, socket);
  socket.emit("matched", { name: other.data.name });
  other.emit("matched", { name: socket.data.name });
}

/* ---------- sockets ---------- */
io.on("connection", (socket) => {
  const ip = getIp(socket);
  const until = bans.get(ip);
  if (until && until > Date.now()) {
    socket.emit("banned");
    return socket.disconnect(true);
  }
  socket.data = { name: "Stranger", msgTimes: [], last: null };
  broadcastOnline();

  socket.on("start", (payload) => {
    socket.data.name = sanitizeName(payload?.name);
    unlink(socket, true);
    pair(socket);
  });

  socket.on("leave", () => {
    unlink(socket, true);
    socket.emit("idle");
  });

  socket.on("message", (text) => {
    const p = partners.get(socket.id);
    if (!p || typeof text !== "string") return;
    const now = Date.now();
    socket.data.msgTimes = socket.data.msgTimes.filter((t) => now - t < 5000);
    if (socket.data.msgTimes.length >= 6) return socket.emit("slow_down");
    socket.data.msgTimes.push(now);
    const msg = clean(text.trim().slice(0, 500));
    if (msg) p.emit("message", { text: msg });
  });

  socket.on("typing", (on) => {
    partners.get(socket.id)?.emit("typing", !!on);
  });

  socket.on("report", async ({ reason, note } = {}) => {
    const target = partners.get(socket.id) || socket.data.last;
    if (!target) return;
    const reportedIp = getIp(target);
    const reporterIp = ip;
    if (reportedIp === reporterIp) return;
    const map = reports.get(reportedIp) || new Map();
    map.set(reporterIp, Date.now());
    reports.set(reportedIp, map);
    const recent = [...map.values()].filter((t) => Date.now() - t < BAN_MS).length;
    if (recent >= REPORTS_TO_BAN) {
      bans.set(reportedIp, Date.now() + BAN_MS);
      target.emit("banned");
      target.disconnect(true);
    }
    console.log(`[report] ${reason} against ${reportedIp}`);
    if (Report) {
      Report.create({
        reason: String(reason || "other").slice(0, 30),
        note: String(note || "").slice(0, 250),
        reportedIp,
        reporterIp,
      }).catch(() => {});
    }
    socket.emit("report_ok");
  });

  socket.on("disconnect", () => {
    unlink(socket, true);
    broadcastOnline();
  });
});

/* ---------- static client ---------- */
app.get("/health", (_req, res) => res.send("ok"));
const dist = path.join(__dirname, "dist");
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
