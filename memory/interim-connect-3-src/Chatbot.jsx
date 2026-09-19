import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Button } from "./components/ui/button.jsx";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function authHeaders() {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function newSessionId() {
  const key = "interimio_chat_session";
  let v = localStorage.getItem(key);
  if (!v) {
    v = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, v);
  }
  return v;
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ich bin Interi, dein KI-Assistent. Wie kann ich helfen? 👋" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionId = useRef(newSessionId());
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await axios.post(
        `${API}/chatbot/message`,
        { session_id: sessionId.current, message: q, history: messages.slice(-10) },
        { headers: authHeaders() }
      );
      const reply = res.data?.reply || "…";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            "Der Assistent ist gerade nicht erreichbar. Bitte erneut versuchen oder uns direkt schreiben.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="chatbot-fab"
          aria-label="Chat öffnen"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-xl text-white text-2xl flex items-center justify-center transition-transform hover:scale-105"
          style={{ background: "#1d4ed8" }}
        >
          💬
        </button>
      )}

      {open && (
        <div
          data-testid="chatbot-panel"
          className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] rounded-xl shadow-2xl border bg-white flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3 flex items-center justify-between text-white" style={{ background: "#1d4ed8" }}>
            <div>
              <div className="text-sm font-semibold">Interi</div>
              <div className="text-xs opacity-80">KI-Assistent · meistens unter 3 Sek</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Chat schließen"
              data-testid="chatbot-close"
              className="opacity-80 hover:opacity-100 text-lg"
            >×</button>
          </div>

          <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] text-sm rounded-lg px-3 py-2 whitespace-pre-line ${
                  m.role === "user"
                    ? "ml-auto bg-blue-600 text-white"
                    : "mr-auto bg-white border"
                }`}
                data-testid={`chatbot-msg-${m.role}`}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="mr-auto bg-white border rounded-lg px-3 py-2 text-sm opacity-70" data-testid="chatbot-typing">
                Interi tippt…
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t bg-white flex gap-2 items-end">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Frage stellen…"
              data-testid="chatbot-input"
              className="flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={send} disabled={busy || !input.trim()} className="btn-primary" data-testid="chatbot-send">
              Senden
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
