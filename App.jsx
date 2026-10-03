import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io({ autoConnect: true });
const EMOJIS = ["😊","😂","😍","😎","🥳","😢","😡","🤔","😴","🙄","👍","👋","🙏","💪","🔥","✨","🎉","💯","👀","❤️"];
const REASONS = [
  ["spam", "Spam"],
  ["harassment", "Harassment"],
  ["hate", "Hate speech"],
  ["inappropriate", "Inappropriate content"],
  ["other", "Other"],
];

export default function App() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [ageOk, setAgeOk] = useState(() => localStorage.getItem("age18") === "1");
  const [name, setName] = useState(() => localStorage.getItem("name") || "Stranger");
  const [phase, setPhase] = useState("intro"); // intro | waiting | chat | ended | banned
  const [partner, setPartner] = useState("Stranger");
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const endRef = useRef(null);
  const typingTimer = useRef(null);

  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const add = (m) => setMsgs((x) => [...x, m]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    socket.on("online", setOnline);
    socket.on("waiting", () => { setPhase("waiting"); setMsgs([]); setTyping(false); });
    socket.on("matched", ({ name }) => {
      setPartner(name || "Stranger");
      setMsgs([{ from: "sys", text: "You're connected. Say hi!" }]);
      setTyping(false);
      setPhase("chat");
    });
    socket.on("message", ({ text }) => { setTyping(false); add({ from: "them", text }); });
    socket.on("typing", setTyping);
    socket.on("partner_left", () => {
      add({ from: "sys", text: "Stranger disconnected." });
      setTyping(false);
      setPhase("ended");
    });
    socket.on("idle", () => setPhase("intro"));
    socket.on("slow_down", () => flash("Slow down, you're sending too fast."));
    socket.on("report_ok", () => flash("Report sent. Thanks."));
    socket.on("banned", () => setPhase("banned"));
    return () => socket.removeAllListeners();
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  const start = () => {
    const n = name.trim() || "Stranger";
    localStorage.setItem("name", n);
    socket.emit("start", { name: n });
  };

  const send = () => {
    const t = text.trim();
    if (!t || phase !== "chat") return;
    socket.emit("message", t);
    add({ from: "me", text: t });
    setText("");
    setEmojiOpen(false);
    socket.emit("typing", false);
  };

  const onInput = (e) => {
    setText(e.target.value);
    socket.emit("typing", true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit("typing", false), 1500);
  };

  const sendReport = () => {
    socket.emit("report", { reason, note });
    setReportOpen(false);
    setNote("");
  };

  const inChat = phase === "chat" || phase === "ended" || phase === "waiting";

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight">StrangerChat</h1>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {online} online
          </span>
        </div>
        <button
          onClick={() => setDark(!dark)}
          aria-label="Toggle dark mode"
          className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-white dark:border-slate-600 dark:hover:bg-night-2"
        >
          {dark ? "Light" : "Dark"}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        {phase === "banned" && (
          <Card>
            <h2 className="text-lg font-semibold">You've been temporarily blocked</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Multiple users reported your behaviour. Try again after 24 hours.
            </p>
          </Card>
        )}

        {phase === "intro" && (
          <Card>
            <h2 className="text-2xl font-semibold">Talk to a stranger, right now</h2>
            <p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-300">
              One-on-one text chat. No signup, nothing is saved. Don't share personal details like phone numbers or addresses.
            </p>
            <label className="mt-5 block text-sm font-medium" htmlFor="name">Your name</label>
            <input
              id="name"
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ageOk && start()}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 dark:border-slate-600 dark:bg-night dark:text-white"
            />
            <button
              onClick={start}
              disabled={!ageOk}
              className="mt-4 w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              Start chat
            </button>
            <ul className="mt-6 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <li>Text only. No images or links.</li>
              <li>Be respectful. Abusive users get blocked after reports.</li>
            </ul>
          </Card>
        )}

        {inChat && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-night-2">
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">
                {phase === "waiting" ? "?" : partner[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {phase === "waiting" ? "Looking for someone…" : partner}
              </span>
              <button
                onClick={() => setReportOpen(true)}
                disabled={phase === "waiting"}
                className="rounded-md border border-red-300 px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Report
              </button>
              <button
                onClick={start}
                className="rounded-md bg-brand px-2.5 py-1.5 text-sm font-medium text-white hover:brightness-110"
              >
                New chat
              </button>
              <button
                onClick={() => socket.emit("leave")}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-night"
              >
                Stop
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
              {phase === "waiting" && (
                <p className="py-10 text-center text-sm text-slate-500">Waiting for another person to join…</p>
              )}
              {msgs.map((m, i) =>
                m.from === "sys" ? (
                  <p key={i} className="py-1 text-center text-xs text-slate-500">{m.text}</p>
                ) : (
                  <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                        m.from === "me"
                          ? "rounded-br-sm bg-brand text-white"
                          : "rounded-bl-sm bg-slate-100 text-ink dark:bg-night dark:text-slate-100"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                )
              )}
              {typing && (
                <div className="flex items-center gap-1 px-1 text-slate-400" aria-label="Stranger is typing">
                  <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {phase === "ended" && (
              <div className="border-t border-slate-200 p-3 text-center dark:border-slate-700">
                <button onClick={start} className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:brightness-110">
                  Find a new stranger
                </button>
              </div>
            )}

            {phase === "chat" && (
              <div className="relative border-t border-slate-200 p-2 dark:border-slate-700">
                {emojiOpen && (
                  <div className="absolute bottom-full left-2 mb-2 grid w-72 grid-cols-8 gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-night-2">
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => setText((t) => t + e)} className="rounded p-1 text-lg hover:bg-slate-100 dark:hover:bg-night">
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => setEmojiOpen(!emojiOpen)} aria-label="Emoji" className="px-2 text-xl">🙂</button>
                  <input
                    value={text}
                    onChange={onInput}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    maxLength={500}
                    placeholder="Type a message"
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 dark:border-slate-600 dark:bg-night dark:text-white"
                  />
                  <button onClick={send} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:brightness-110">
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="px-4 pb-3 text-center text-xs text-slate-500">
        Chats are not stored. Report anyone who makes you uncomfortable.
      </footer>

      {!ageOk && phase !== "banned" && (
        <Modal>
          <h2 className="text-xl font-semibold">Are you 18 or older?</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            This site is for adults only. By continuing you confirm you are 18+ and agree to chat respectfully.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => (window.location.href = "https://www.google.com")}
              className="rounded-lg border border-slate-300 px-5 py-2 dark:border-slate-600"
            >
              No, leave
            </button>
            <button
              onClick={() => { localStorage.setItem("age18", "1"); setAgeOk(true); }}
              className="flex-1 rounded-lg bg-brand px-5 py-2 font-semibold text-white"
            >
              Yes, I'm 18+
            </button>
          </div>
        </Modal>
      )}

      {reportOpen && (
        <Modal>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Report this user</h2>
            <button onClick={() => setReportOpen(false)} aria-label="Close" className="text-2xl leading-none">×</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {REASONS.map(([v, l]) => (
              <button
                key={v}
                onClick={() => setReason(v)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  reason === v ? "border-brand bg-brand-soft text-brand" : "border-slate-300 dark:border-slate-600"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={250}
            rows={3}
            placeholder="Add a note (optional)"
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-2 text-base text-ink dark:border-slate-600 dark:bg-night dark:text-white"
          />
          <button onClick={sendReport} className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2 font-semibold text-white">
            Send report
          </button>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-night-2">
      {children}
    </div>
  );
}

function Modal({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-night-2">
        {children}
      </div>
    </div>
  );
}
