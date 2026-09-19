import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Lock, LockOpen, LifeBuoy, Send, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button.jsx";
import { Badge } from "../components/ui/badge.jsx";
import { Textarea } from "../components/ui/textarea.jsx";
import { Switch } from "../components/ui/switch.jsx";
import { useAuthCtx } from "../context/AuthContext.jsx";
import { api, errMsg } from "../lib/api";

const fmtTime = (iso) => { const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("de-DE"); };

function ConversationList({ convs, selectedId, onSelect, onSupport, isAdmin }) {
  return (
    <div className="flex flex-col h-full" data-testid="conversation-list">
      <div className="p-4 border-b flex items-center justify-between">
        <h1 className="text-xl font-bold">Messages</h1>
        {!isAdmin && <Button size="sm" variant="outline" data-testid="contact-team-btn" onClick={onSupport}><LifeBuoy className="h-4 w-4 mr-1" />Interimio team</Button>}
      </div>
      <div className="flex-1 overflow-y-auto">
        {convs.length === 0 && <div className="p-6 text-sm opacity-60" data-testid="conversation-empty">No conversations yet. Requests you send or receive appear here.</div>}
        {convs.map((c) => (
          <button key={c.id} data-testid={`conversation-item-${c.id}`} onClick={() => onSelect(c.id)} className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-[rgba(11,107,203,0.05)] ${selectedId === c.id ? "bg-[rgba(11,107,203,0.08)]" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-sm truncate flex items-center gap-1">
                {c.type === "support" ? <LifeBuoy className="h-3.5 w-3.5 text-[var(--brand-blue)]" /> : null}{c.title}
              </div>
              <div className="text-xs opacity-60 whitespace-nowrap">{c.last_message_at ? fmtTime(c.last_message_at) : ""}</div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-xs opacity-70 truncate">{c.last_message_preview || "…"}</div>
              {c.unread > 0 && <Badge className="bg-[var(--brand-blue)] text-white" data-testid={`conversation-unread-${c.id}`}>{c.unread}</Badge>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Thread({ conv, user, onBack, onReleaseChange }) {
  const [msgs, setMsgs] = useState([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const isAdmin = user.role === "admin";

  const load = async () => {
    try {
      const res = await api.get(`/conversations/${conv.id}/messages`);
      setMsgs(res.data || []);
    } catch (e) { /* polling */ }
  };
  useEffect(() => { setMsgs([]); load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [conv.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs.length]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await api.post(`/conversations/${conv.id}/messages`, { body: text });
      setMsgs((prev) => [...prev, res.data]);
      setBody("");
    } catch (e) {
      toast.error(errMsg(e, "Could not send message"));
    } finally {
      setSending(false);
    }
  };

  const toggleRelease = async (v) => {
    try {
      await api.patch(`/conversations/${conv.id}/release`, { released: v });
      onReleaseChange(conv.id, v);
      toast.success(v ? "Contact details released" : "Contact details hidden");
    } catch (e) {
      toast.error(errMsg(e, "Could not update"));
    }
  };

  const nameFor = (m) => {
    if (m.sender_id === user.id) return "You";
    if (m.sender_role === "admin") return "Interimio team";
    return m.sender_email || m.sender_role;
  };

  return (
    <div className="flex flex-col h-full min-w-0 w-full" data-testid="message-thread">
      <div className="p-4 border-b flex items-center gap-3">
        <button className="md:hidden" onClick={onBack} data-testid="thread-back-btn"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate" data-testid="thread-title">{conv.title}</div>
          <div className="text-xs opacity-60 truncate">{(conv.participants || []).map((p) => p.email).join(", ")}{conv.type === "lead" ? " · Interimio team can read along" : ""}</div>
        </div>
        {conv.type === "lead" && isAdmin && (
          <label className="flex items-center gap-2 text-xs" data-testid="release-toggle-label">
            {conv.contact_released ? <LockOpen className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-amber-600" />}
            Release contacts
            <Switch data-testid="release-toggle" checked={!!conv.contact_released} onCheckedChange={toggleRelease} />
          </label>
        )}
        {conv.type === "lead" && conv.lead_id && isAdmin && <Link to="/admin" className="text-xs underline" data-testid="thread-admin-link">Lead inbox</Link>}
      </div>

      {conv.type === "lead" && !conv.contact_released && (
        <div className="px-4 py-2 text-xs bg-amber-50 text-amber-800 border-b flex items-center gap-2" data-testid="redaction-banner">
          <ShieldCheck className="h-4 w-4" /> Contact details (email, phone, links) stay hidden until Interimio releases this request. Keep the conversation here.
        </div>
      )}
      {conv.type === "support" && (
        <div className="px-4 py-2 text-xs bg-[rgba(11,107,203,0.06)] text-[var(--brand-blue-700)] border-b flex items-center gap-2"><LifeBuoy className="h-4 w-4" /> Direct line to the Interimio team. We usually reply within one business day.</div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f6f9fd]" data-testid="message-list">
        {msgs.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`message-${m.id}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${mine ? "bg-[var(--brand-blue)] text-white rounded-br-sm" : m.sender_role === "admin" ? "bg-[#06182b] text-white rounded-bl-sm" : "bg-white rounded-bl-sm"}`}>
                <div className={`text-[11px] mb-1 ${mine || m.sender_role === "admin" ? "opacity-70" : "opacity-60"}`}>{nameFor(m)} · {fmtTime(m.created_at)}</div>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {m.redacted && <div className="mt-1 text-[11px] opacity-70 inline-flex items-center gap-1"><Lock className="h-3 w-3" /> contact details hidden</div>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t flex gap-2 items-end bg-white">
        <Textarea data-testid="message-input" rows={2} className="flex-1 resize-none" placeholder="Write a message… (Enter to send, Shift+Enter for new line)" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button className="btn-primary" data-testid="message-send-btn" disabled={sending || !body.trim()} onClick={send}><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { user, openLogin } = useAuthCtx();
  const [params, setParams] = useSearchParams();
  const [convs, setConvs] = useState([]);
  const selectedId = params.get("c");
  const selected = convs.find((c) => c.id === selectedId) || null;

  const loadConvs = async () => {
    try {
      const res = await api.get("/conversations");
      setConvs(res.data || []);
    } catch (e) { /* polling */ }
  };
  useEffect(() => { if (!user) return; loadConvs(); const t = setInterval(loadConvs, 15000); return () => clearInterval(t); }, [user]);

  const select = (id) => { setParams(id ? { c: id } : {}); setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))); };

  const openSupport = async () => {
    try {
      const res = await api.post("/conversations/support");
      await loadConvs();
      select(res.data.id);
    } catch (e) {
      toast.error(errMsg(e, "Could not open conversation"));
    }
  };

  if (!user) return <div className="mx-auto max-w-3xl px-6 py-20 text-center" data-testid="messages-login-required"><p>Log in to see your messages.</p><Button className="btn-primary mt-4" onClick={openLogin}>Login</Button></div>;

  return (
    <div className="mx-auto max-w-7xl px-0 md:px-6 md:py-8" data-testid="messages-page">
      <div className="grid md:grid-cols-3 h-[calc(100vh-64px)] md:h-[calc(100vh-130px)] bg-white md:rounded-2xl md:border overflow-hidden">
        <div className={`md:col-span-1 min-w-0 md:border-r ${selected ? "hidden md:block" : "block"}`}>
          <ConversationList convs={convs} selectedId={selectedId} onSelect={select} onSupport={openSupport} isAdmin={user.role === "admin"} />
        </div>
        <div className={`md:col-span-2 min-w-0 ${selected ? "block" : "hidden md:block"}`}>
          {selected ? (
            <Thread conv={selected} user={user} onBack={() => select(null)} onReleaseChange={(id, v) => setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, contact_released: v } : c)))} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm opacity-60 p-6" data-testid="thread-placeholder">Select a conversation</div>
          )}
        </div>
      </div>
    </div>
  );
}
