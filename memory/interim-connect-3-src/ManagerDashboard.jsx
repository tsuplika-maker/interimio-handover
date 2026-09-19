import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.jsx";
import { Button } from "./components/ui/button.jsx";
import { Input } from "./components/ui/input.jsx";
import { Label } from "./components/ui/label.jsx";
import { Badge } from "./components/ui/badge.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.jsx";
import { Textarea } from "./components/ui/textarea.jsx";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function authHeaders() {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const STATUS = [
  { value: "new", label: "Neu", className: "bg-blue-100 text-blue-800" },
  { value: "in_negotiation", label: "In Verhandlung", className: "bg-yellow-100 text-yellow-800" },
  { value: "won", label: "Gewonnen", className: "bg-green-100 text-green-800" },
  { value: "lost", label: "Abgelehnt", className: "bg-gray-200 text-gray-700" },
];

function LeadInbox() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/leads/mine`, { headers: authHeaders() });
      setLeads(res.data);
    } catch (e) {
      if (e?.response?.status === 403) {
        toast.error("Nur für Manager");
      } else {
        toast.error("Konnte Leads nicht laden");
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (leadId, status) => {
    try {
      await axios.patch(`${API}/leads/${leadId}/status`, { status }, { headers: authHeaders() });
      toast.success("Status aktualisiert");
      load();
    } catch { toast.error("Status konnte nicht geändert werden"); }
  };

  if (loading) return <div className="p-4 text-sm opacity-70" data-testid="leads-loading">Lade Anfragen…</div>;
  if (!leads.length) return (
    <Card data-testid="leads-empty">
      <CardHeader>
        <CardTitle>Noch keine Anfragen</CardTitle>
        <CardDescription>Sobald ein Unternehmen Sie anfragt, erscheint die Anfrage hier — und Sie erhalten zusätzlich eine E-Mail.</CardDescription>
      </CardHeader>
    </Card>
  );

  return (
    <div className="grid gap-4" data-testid="leads-list">
      {leads.map((l) => {
        const s = STATUS.find(x => x.value === (l.status || "new")) || STATUS[0];
        return (
          <Card key={l.id} data-testid={`lead-${l.id}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{l.company_name}</CardTitle>
                  <CardDescription>{l.contact_name} · {l.email}</CardDescription>
                </div>
                <Badge className={s.className}>{s.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-xs opacity-60">Startdatum</div><div className="font-medium">{l.start_date || "—"}</div></div>
                <div><div className="text-xs opacity-60">Tage</div><div className="font-medium">{l.days}</div></div>
                <div><div className="text-xs opacity-60">Tagessatz</div><div className="font-medium">€{l.daily_rate_eur}</div></div>
                <div><div className="text-xs opacity-60">Service-Fee (20 %)</div><div className="font-medium text-blue-700">€{l.fee_eur}</div></div>
              </div>
              {l.message && (
                <div className="rounded-md bg-slate-50 p-3 whitespace-pre-line">{l.message}</div>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                <span className="text-xs opacity-70 mr-1">Status ändern:</span>
                {STATUS.map(opt => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={l.status === opt.value ? "default" : "outline"}
                    onClick={() => updateStatus(l.id, opt.value)}
                    data-testid={`lead-status-${l.id}-${opt.value}`}
                  >{opt.label}</Button>
                ))}
                <a className="ml-auto text-xs text-blue-700 underline" href={`mailto:${l.email}?subject=Re: ${encodeURIComponent(l.company_name)} via Interimio`} data-testid={`lead-reply-${l.id}`}>Per E-Mail antworten ↗</a>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ProfileEditor({ user }) {
  const [mgr, setMgr] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/managers/me/mine`, { headers: authHeaders() });
        if (res.data) {
          setMgr(res.data);
          setForm({
            name: res.data.name || "",
            title: res.data.title || "",
            location: res.data.location || "",
            daily_rate_eur: res.data.daily_rate_eur || 0,
            bio: res.data.bio || "",
            skills: (res.data.skills || []).join(", "),
            image_url: res.data.image_url || "",
          });
        }
      } catch { /* none */ }
    })();
  }, []);

  if (!mgr) return (
    <Card data-testid="profile-editor-empty">
      <CardHeader>
        <CardTitle>Profil noch nicht erstellt</CardTitle>
        <CardDescription>Bitte schließen Sie zuerst den Onboarding-Wizard ab oder abonnieren Sie Interimio Pro.</CardDescription>
      </CardHeader>
    </Card>
  );

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/managers/${mgr.id}`, {
        name: form.name,
        title: form.title,
        location: form.location,
        daily_rate_eur: Number(form.daily_rate_eur),
        bio: form.bio,
        skills: form.skills.split(",").map(s => s.trim()).filter(Boolean),
        image_url: form.image_url,
      }, { headers: authHeaders() });
      toast.success("Profil aktualisiert");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Konnte nicht speichern");
    } finally { setSaving(false); }
  };

  return (
    <Card data-testid="profile-editor">
      <CardHeader>
        <CardTitle>Profil bearbeiten</CardTitle>
        <CardDescription>Änderungen sind sofort öffentlich auf Ihrer Profil-Seite sichtbar.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} data-testid="pe-name" /></div>
          <div><Label>Titel</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} data-testid="pe-title" /></div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div><Label>Standort</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} data-testid="pe-location" /></div>
          <div><Label>Tagessatz (€)</Label><Input type="number" value={form.daily_rate_eur} onChange={e => setForm({...form, daily_rate_eur: e.target.value})} data-testid="pe-rate" /></div>
        </div>
        <div><Label>Foto-URL</Label><Input value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} placeholder="https://…" data-testid="pe-image" /></div>
        <div><Label>Skills (durch Komma getrennt)</Label><Input value={form.skills} onChange={e => setForm({...form, skills: e.target.value})} placeholder="Finance, Restrukturierung, M&A" data-testid="pe-skills" /></div>
        <div><Label>Bio</Label><Textarea rows={5} value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} data-testid="pe-bio" /></div>
        <div className="flex justify-end">
          <Button className="btn-primary" disabled={saving} onClick={save} data-testid="pe-save">{saving ? "Speichere…" : "Speichern"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ManagerDashboard({ user }) {
  if (!user) return (
    <section className="section">
      <div className="mx-auto max-w-3xl px-6">
        <Card><CardHeader><CardTitle>Bitte einloggen</CardTitle></CardHeader></Card>
      </div>
    </section>
  );
  if (user.role !== "manager" && user.role !== "admin") return (
    <section className="section">
      <div className="mx-auto max-w-3xl px-6">
        <Card><CardHeader><CardTitle>Nur für Manager-Accounts</CardTitle><CardDescription>Diese Ansicht steht eingeloggten Interim Managern zur Verfügung.</CardDescription></CardHeader></Card>
      </div>
    </section>
  );
  return (
    <section className="section" data-testid="manager-dashboard">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Mein Manager-Bereich</h1>
          <p className="text-sm opacity-70">Verwalten Sie Anfragen und Ihr öffentliches Profil.</p>
        </div>
        <Tabs defaultValue="leads">
          <TabsList>
            <TabsTrigger value="leads" data-testid="dash-tab-leads">Anfragen</TabsTrigger>
            <TabsTrigger value="profile" data-testid="dash-tab-profile">Profil bearbeiten</TabsTrigger>
          </TabsList>
          <TabsContent value="leads" className="mt-4"><LeadInbox /></TabsContent>
          <TabsContent value="profile" className="mt-4"><ProfileEditor user={user} /></TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
