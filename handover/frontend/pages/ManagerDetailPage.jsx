import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Globe, Languages, Linkedin, MapPin, CalendarDays, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button.jsx";
import { Badge } from "../components/ui/badge.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.jsx";
import { Dialog } from "../components/ui/dialog.jsx";
import { Input } from "../components/ui/input.jsx";
import { Label } from "../components/ui/label.jsx";
import { RequestDialog } from "../components/RequestDialog.jsx";
import { useAuthCtx } from "../context/AuthContext.jsx";
import { api, errMsg } from "../lib/api";

const FALLBACK_IMG = "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40";

function InfoRow({ icon: Icon, label, value, testId }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3" data-testid={testId}>
      <Icon className="h-4 w-4 mt-1 text-[var(--brand-blue)]" />
      <div>
        <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function RequestCard({ m }) {
  const { ensureAuth } = useAuthCtx();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(10);
  const fee = useMemo(() => Math.round(m.daily_rate_eur * (Number(days) || 0) * 0.2), [m.daily_rate_eur, days]);

  const onRequest = () => { if (ensureAuth()) setOpen(true); };

  return (
    <Card className="lg:sticky lg:top-24 border-[rgba(11,107,203,0.25)] shadow-lg" data-testid="manager-request-card">
      <CardHeader>
        <CardDescription>Daily rate</CardDescription>
        <CardTitle className="text-3xl" data-testid="manager-detail-rate">€{m.daily_rate_eur}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Estimated duration (days)</Label>
          <Input data-testid="manager-detail-days-input" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div className="rounded-md bg-[rgba(11,107,203,0.06)] p-3 text-sm space-y-1">
          <div className="flex justify-between"><span>Manager fees</span><span>€{(m.daily_rate_eur * (Number(days) || 0)).toLocaleString("de-DE")}</span></div>
          <div className="flex justify-between font-semibold"><span>Interimio service fee (20%)</span><span data-testid="manager-detail-fee">€{fee.toLocaleString("de-DE")}</span></div>
        </div>
        <Button className="btn-primary w-full" data-testid="manager-detail-request-btn" onClick={onRequest}>Request {m.name.split(" ")[0]}</Button>
        <p className="text-xs opacity-60">Verified client account required. No fee until an engagement is confirmed.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <RequestDialog manager={m} onRequest={() => setOpen(false)} />
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function ManagerDetailPage() {
  const { id } = useParams();
  const [m, setM] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/managers/${id}`).then((r) => setM(r.data)).catch((e) => { setNotFound(true); toast.error(errMsg(e, "Manager not found")); });
  }, [id]);

  if (notFound) return <div className="mx-auto max-w-7xl px-6 py-20" data-testid="manager-not-found">Manager not found. <Link className="underline" to="/">Back to directory</Link></div>;
  if (!m) return <div className="mx-auto max-w-7xl px-6 py-20" data-testid="manager-detail-loading">Loading…</div>;

  const availability = m.availability_start ? `From ${m.availability_start}${m.availability_end ? ` until ${m.availability_end}` : ""}` : "Available on request";

  return (
    <div className="bg-[#f6f9fd]" data-testid="manager-detail-page">
      <div className="bg-[#06182b] text-white">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Link to="/" className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100" data-testid="manager-detail-back-link"><ArrowLeft className="h-4 w-4" /> All managers</Link>
          <div className="mt-6 flex flex-col md:flex-row md:items-end gap-6">
            <img src={m.image_url || FALLBACK_IMG} alt={m.name} className="h-32 w-32 rounded-2xl object-cover ring-4 ring-white/10" />
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold" data-testid="manager-detail-name">{m.name}</h1>
              <p className="mt-1 text-lg opacity-90" data-testid="manager-detail-title">{m.title}</p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm opacity-80">
                <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {m.location}</span>
                {m.years_experience ? <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" /> {m.years_experience}+ years</span> : null}
                {m.linkedin_url ? <a href={m.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" data-testid="manager-detail-linkedin"><Linkedin className="h-4 w-4" /> LinkedIn</a> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(m.skills || []).map((s, i) => <Badge key={i} className="bg-white/10 text-white border-white/20">{s}</Badge>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-12 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {(m.about || m.bio) && (
            <section>
              <h2 className="text-lg font-semibold">About</h2>
              <p className="mt-2 text-sm leading-7 opacity-80" data-testid="manager-detail-about">{m.about || m.bio}</p>
            </section>
          )}

          {(m.highlights || []).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Track record</h2>
              <ul className="mt-3 space-y-2" data-testid="manager-detail-highlights">
                {m.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[var(--brand-blue)]" /> {h}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-5 sm:grid-cols-2 rounded-2xl border bg-white p-6">
            <InfoRow icon={Globe} label="Industries" value={(m.industries || []).join(", ")} testId="manager-detail-industries" />
            <InfoRow icon={Languages} label="Languages" value={(m.languages || []).join(", ")} testId="manager-detail-languages" />
            <InfoRow icon={CalendarDays} label="Availability" value={availability} testId="manager-detail-availability" />
            <InfoRow icon={MapPin} label="Base location" value={m.location} testId="manager-detail-location" />
          </section>
        </div>
        <div><RequestCard m={m} /></div>
      </div>
    </div>
  );
}
