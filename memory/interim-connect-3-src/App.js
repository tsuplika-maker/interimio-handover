import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from "axios";
import { toast, Toaster } from "sonner";

// shadcn components
import { Button } from "./components/ui/button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.jsx";
import { Input } from "./components/ui/input.jsx";
import { Label } from "./components/ui/label.jsx";
import { Badge } from "./components/ui/badge.jsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog.jsx";
import { Textarea } from "./components/ui/textarea.jsx";
import { Calendar } from "./components/ui/calendar.jsx";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./components/ui/input-otp.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.jsx";
import { I18nProvider, useI18n } from "./i18n.js";
import { SettingsProvider, useSetting, useSettings } from "./SettingsContext.jsx";
import ManagerDashboard from "./ManagerDashboard.jsx";
import { Impressum, Datenschutz, AGB } from "./LegalPages.jsx";
import Chatbot from "./Chatbot.jsx";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function authHeaders() {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function useAuth() {
  const [user, setUser] = useState(null);

  const me = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      setUser(res.data);
    } catch (e) {
      console.error(e);
      localStorage.removeItem("access_token");
      setUser(null);
    }
  };

  useEffect(() => { me(); }, []);

  const login = async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem("access_token", res.data.access_token);
    await me();
    toast.success("Logged in");
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    setUser(null);
  };

  return { user, setUser, refreshUser: me, login, logout };
}

function Header({ openLogin, openRegister, user, logout }) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur border-b" data-testid="app-header">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="brand-link" aria-label="Interimio">
          <img src="/interimio-logo.jpeg" alt="Interimio" className="h-14 w-auto rounded-md object-contain" />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user?.role === "admin" && (
            <Link to="/admin" className="font-medium text-blue-700" data-testid="nav-admin">{t("nav_admin")}</Link>
          )}
          {user && (user.role === "manager" || user.role === "admin") && (
            <Link to="/dashboard" className="font-medium text-blue-700" data-testid="nav-dashboard">Mein Bereich</Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === "de" ? "en" : "de")}
            className="text-xs font-semibold border rounded-md px-2 py-1 hover:bg-gray-50"
            data-testid="lang-toggle"
            aria-label="Toggle language"
          >{t("lang_toggle")}</button>
          {user ? (
            <>
              <span className="text-sm opacity-80" data-testid="user-info">{user.email} • {user.role}{user.role === "manager" && user.subscription_active ? " ✓PRO" : ""} {user.email_verified ? "✓" : "(verify)"}</span>
              <button className="btn-primary" onClick={logout} data-testid="logout-btn">{t("nav_logout")}</button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={openLogin} data-testid="login-open-btn">{t("nav_login")}</button>
              <button className="btn-primary" onClick={openRegister} data-testid="register-open-btn">{t("nav_register")}</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ ensureLoginOnly, openRegister, user }) {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const heroUrl = (settings && settings.hero_image_url) || "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1920&q=80";
  const heroH1 = (settings && settings[`hero_h1_${lang}`]) || t("hero_h1");
  const heroSub = (settings && settings[`hero_sub_${lang}`]) || t("hero_sub");

  const handleMandate = (e) => {
    e.preventDefault();
    // Logged-out users: prompt registration (as client) before they can post a mandate.
    if (!user) {
      openRegister();
      toast.info("Bitte registrieren Sie sich als Unternehmen, um ein Mandat einzustellen.");
      return;
    }
    if (user.role !== "client") {
      toast.error("Mandate einstellen ist Unternehmens-Accounts vorbehalten.");
      return;
    }
    const el = document.getElementById("ai-matching-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Focus the first input of the matching wizard for instant typing.
      setTimeout(() => {
        const input = document.querySelector('[data-testid="match-title"]');
        if (input) input.focus();
      }, 600);
    }
  };

  return (
    <section className="relative hero-bg" style={{ backgroundImage: `url(${heroUrl})` }} data-testid="hero-section">
      <div className="hero-overlay" />
      <div className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-3xl text-white">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight" data-testid="hero-h1">{heroH1}</h1>
          <p className="mt-5 text-lg md:text-xl opacity-95 leading-relaxed">{heroSub}</p>
          <div className="mt-7 flex gap-3 flex-wrap">
            <a href="#browse"><button className="btn-primary text-base" data-testid="hero-browse-btn">{t("hero_cta_find")}</button></a>
            <button className="btn-primary text-base" style={{ background: "#0a5db0" }} onClick={handleMandate} data-testid="hero-mandate-btn">{t("hero_cta_mandate")}</button>
            <button className="btn-primary text-base" style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.4)" }} onClick={openRegister} data-testid="hero-register-btn">{t("hero_cta_register")}</button>
          </div>
          <div className="mt-5 text-sm opacity-80 italic" data-testid="hero-tagline">{t("hero_tagline")}</div>
        </div>
      </div>
    </section>
  );
}

function ValueProps({ openRegister }) {
  const { t } = useI18n();
  const checkBlue = <span className="text-blue-600 flex-shrink-0">✓</span>;
  const checkGreen = <span className="text-green-600 flex-shrink-0">✓</span>;
  return (
    <section className="section" data-testid="value-props">
      <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* For Companies */}
        <Card className="card-hover border-l-4 border-l-green-600" data-testid="value-prop-client">
          <CardHeader>
            <div className="text-xs font-semibold uppercase tracking-wider text-green-700">{t("company_section_eyebrow")}</div>
            <CardTitle className="text-2xl mt-1">{t("company_section_title")}</CardTitle>
            <CardDescription className="text-base mt-2 leading-relaxed">{t("company_section_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">{checkGreen}{t("company_b1")}</li>
              <li className="flex gap-2">{checkGreen}{t("company_b2")}</li>
              <li className="flex gap-2">{checkGreen}{t("company_b3")}</li>
              <li className="flex gap-2">{checkGreen}{t("company_b4")}</li>
              <li className="flex gap-2">{checkGreen}{t("company_b5")}</li>
            </ul>
            <a href="#ai-matching-section" className="mt-5 inline-block"><Button className="btn-primary" style={{ background: "#15803d" }} data-testid="vp-client-cta">{t("company_cta")}</Button></a>
          </CardContent>
        </Card>

        {/* For Managers */}
        <Card className="card-hover border-l-4 border-l-blue-600" data-testid="value-prop-manager">
          <CardHeader>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">{t("manager_section_eyebrow")}</div>
            <CardTitle className="text-2xl mt-1">{t("manager_section_title")}</CardTitle>
            <CardDescription className="text-base mt-2 leading-relaxed">{t("manager_section_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">{checkBlue}{t("manager_b1")}</li>
              <li className="flex gap-2">{checkBlue}{t("manager_b2")}</li>
              <li className="flex gap-2">{checkBlue}{t("manager_b3")}</li>
              <li className="flex gap-2">{checkBlue}{t("manager_b4")}</li>
              <li className="flex gap-2">{checkBlue}{t("manager_b5")}</li>
            </ul>
            <Button className="btn-primary mt-5" onClick={openRegister} data-testid="vp-manager-cta">{t("manager_cta")}</Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function QualitySection() {
  const { t } = useI18n();
  return (
    <section className="section bg-slate-50 border-y" data-testid="quality-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">{t("quality_eyebrow")}</div>
        <h2 className="text-3xl font-bold mt-1">{t("quality_title")}</h2>
        <p className="mt-3 text-base opacity-80 max-w-3xl leading-relaxed">{t("quality_desc")}</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {[t("quality_b1"), t("quality_b2"), t("quality_b3"), t("quality_b4")].map((item, i) => (
            <div key={i} className="flex gap-3 rounded-md bg-white border p-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{i + 1}</div>
              <div className="text-sm">{item}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const { t } = useI18n();
  const steps = [
    { num: "1", title: t("how_step1"), desc: t("how_step1_desc") },
    { num: "2", title: t("how_step2"), desc: t("how_step2_desc") },
    { num: "3", title: t("how_step3"), desc: t("how_step3_desc") },
    { num: "4", title: t("how_step4"), desc: t("how_step4_desc") },
  ];
  return (
    <section className="section" data-testid="how-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">{t("how_eyebrow")}</div>
        <h2 className="text-3xl font-bold mt-1">{t("how_title")}</h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <div key={s.num} className="relative rounded-lg border p-5 bg-white">
              <div className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">{s.num}</div>
              <div className="font-semibold mt-2" data-testid={`how-step-${i + 1}`}>{s.title}</div>
              <div className="text-sm opacity-80 mt-1">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoriesSection() {
  const { t } = useI18n();
  const cats = ["Finance", "HR", "Operations", "Vertrieb / Sales", "IT", "Transformation", "Restrukturierung", "General Management"];
  return (
    <section className="section bg-slate-50 border-y" data-testid="categories-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">{t("categories_eyebrow")}</div>
        <h2 className="text-3xl font-bold mt-1">{t("categories_title")}</h2>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {cats.map((c) => (
            <div key={c} className="rounded-lg bg-white border px-4 py-3 text-center font-semibold" data-testid={`cat-${c.toLowerCase().replace(/[^a-z]/g, '-')}`}>{c}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCTA() {
  const { t } = useI18n();
  return (
    <section className="py-16 bg-gradient-to-br from-blue-700 to-blue-900 text-white" data-testid="closing-cta">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold leading-tight">{t("closing_cta")}</h2>
        <div className="mt-6">
          <a href="#ai-matching-section">
            <Button className="btn-primary text-base" style={{ background: "white", color: "#0b6bcb" }} data-testid="closing-cta-btn">{t("closing_cta_btn")}</Button>
          </a>
        </div>
      </div>
    </section>
  );
}

function MarketBarometer() {
  const { t } = useI18n();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/stats/public`);
        if (!cancelled) setStats(res.data);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, []);

  if (!stats) return null;

  const items = [
    { label: t("barometer_active"), value: stats.active_managers },
    { label: t("barometer_available"), value: stats.available_this_week },
    { label: t("barometer_avg_rate"), value: `€${(stats.avg_daily_rate_eur || 0).toLocaleString("de-DE")}` },
    { label: t("barometer_total_leads"), value: stats.total_leads },
  ];

  return (
    <section className="py-8 bg-gradient-to-r from-blue-50 to-green-50 border-y" data-testid="market-barometer">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <div className="text-xs uppercase tracking-wider opacity-70">{t("barometer_eyebrow")}</div>
            <h3 className="text-xl font-semibold">{t("barometer_title")}</h3>
          </div>
          <span className="inline-flex items-center gap-2 text-xs opacity-70">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-600"></span></span>
            {t("barometer_freshness")}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg bg-white border p-4" data-testid={`barometer-item-${i}`}>
              <div className="text-xs opacity-70">{it.label}</div>
              <div className="mt-1 text-3xl font-bold text-gray-900">{it.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PendingApprovalNotice({ user }) {
  const { t } = useI18n();
  if (!user || user.role !== "client" || user.client_approved) return null;
  if (!user.email_verified) return null;
  return (
    <section className="py-6" data-testid="pending-approval-notice">
      <div className="mx-auto max-w-7xl px-6">
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">⏳ {t("pending_title")}</CardTitle>
            <CardDescription className="text-amber-900/80">{t("pending_desc")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </section>
  );
}


function ManagerOfMonth() {
  const { t } = useI18n();
  const [m, setM] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/managers/spotlight`);
        if (!cancelled) setM(res.data || null);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, []);

  if (!m) return null;
  return (
    <section className="section" data-testid="manager-of-month">
      <div className="mx-auto max-w-7xl px-6">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-3 gap-0">
            <div className="md:col-span-1">
              <img src={m.image_url || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80"} alt={m.name} className="w-full h-full object-cover min-h-[260px]" />
            </div>
            <div className="md:col-span-2 p-6">
              <div className="text-xs uppercase tracking-wider opacity-70">{t("spotlight_eyebrow")}</div>
              <h3 className="text-2xl font-bold mt-1" data-testid="spotlight-name">{m.name}</h3>
              <div className="text-base opacity-80">{m.title} · {m.location}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(m.skills || []).slice(0, 6).map((s, i) => (<Badge key={i} className="badge-skill">{s}</Badge>))}
              </div>
              <p className="mt-3 text-sm opacity-90 line-clamp-3">{m.bio}</p>
              <div className="mt-4">
                <Link to={`/m/${m.id}`}><Button className="btn-primary" data-testid="spotlight-cta">{t("spotlight_cta")}</Button></Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function SearchBar({ onChange, values }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <div>
        <Label>Search</Label>
        <Input data-testid="search-q" placeholder="Name, title, skill" value={values.q} onChange={(e) => onChange({ ...values, q: e.target.value })} />
      </div>
      <div>
        <Label>Location</Label>
        <Input data-testid="search-location" placeholder="e.g. Berlin" value={values.location} onChange={(e) => onChange({ ...values, location: e.target.value })} />
      </div>
      <div>
        <Label>Min rate (€)</Label>
        <Input data-testid="search-min-rate" type="number" min={0} value={values.minRate} onChange={(e) => onChange({ ...values, minRate: e.target.value })} />
      </div>
      <div>
        <Label>Max rate (€)</Label>
        <Input data-testid="search-max-rate" type="number" min={0} value={values.maxRate} onChange={(e) => onChange({ ...values, maxRate: e.target.value })} />
      </div>
    </div>
  );
}

function ManagerDetailDialog({ manager, ensureAuth, onRequest }) {
  const [openReq, setOpenReq] = useState(false);
  return (
    <DialogContent className="sm:max-w-2xl" data-testid="manager-detail">
      <DialogHeader>
        <DialogTitle>{manager.name}</DialogTitle>
        <DialogDescription>{manager.title} · {manager.location}</DialogDescription>
      </DialogHeader>
      <div className="grid md:grid-cols-3 gap-4">
        <img src={manager.image_url || "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40"} alt={manager.name} className="w-full h-48 object-cover rounded-md md:col-span-1" />
        <div className="md:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-1">
            {(manager.skills || []).map((s, i) => (<Badge key={i} className="badge-skill">{s}</Badge>))}
          </div>
          <p className="text-sm opacity-90">{manager.bio || "No bio yet."}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="opacity-70">Daily rate</div>
              <div className="text-xl font-semibold">€{manager.daily_rate_eur}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="opacity-70">Service fee</div>
              <div className="text-xl font-semibold">20–30% / Tag</div>
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          className="btn-primary"
          data-testid="manager-detail-request-btn"
          onClick={() => { if (!ensureAuth()) return; setOpenReq(true); }}
        >Request this manager</Button>
        <Dialog open={openReq} onOpenChange={setOpenReq}>
          <RequestDialog manager={manager} onRequest={() => { setOpenReq(false); onRequest && onRequest(); }} />
        </Dialog>
      </DialogFooter>
    </DialogContent>
  );
}

function ManagerCard({ m, user }) {
  const showRate = user && user.email_verified && m.daily_rate_eur > 0;
  return (
    <Card className="card-hover" data-testid={`manager-card-${m.id}`}>
      <CardHeader className="flex flex-row items-start gap-4">
        <img src={m.image_url || "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40"} alt={m.name} className="h-16 w-16 rounded-lg object-cover" />
        <div>
          <CardTitle className="text-lg">{m.name}</CardTitle>
          <CardDescription>{m.title} · {m.location}</CardDescription>
          <div className="mt-2 flex flex-wrap gap-1">
            {(m.skills || []).slice(0, 5).map((s, i) => (
              <Badge key={i} className="badge-skill">{s}</Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {showRate && (
          <div className="flex items-center justify-between mb-3" data-testid={`manager-rate-${m.id}`}>
            <div className="text-sm opacity-70">Tagessatz</div>
            <div className="text-xl font-semibold">€{m.daily_rate_eur}</div>
          </div>
        )}
        <div className="flex justify-end">
          <Link to={`/m/${m.id}`} data-testid={`manager-public-${m.id}`}>
            <Button className="btn-primary">Profil ansehen</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function RequestDialog({ manager, onRequest }) {
  const [days, setDays] = useState(5);
  const [startDate, setStartDate] = useState(undefined);
  const [message, setMessage] = useState("");
  const dailyRate = manager.daily_rate_eur;
  const fee = useMemo(() => Math.round(dailyRate * days * 0.2), [dailyRate, days]);
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const submit = async () => {
    try {
      const payload = {
        manager_id: manager.id,
        company_name: company,
        contact_name: name,
        email,
        start_date: startDate ? startDate.toISOString().slice(0, 10) : undefined,
        days: Number(days),
        daily_rate_eur: dailyRate,
        message,
      };
      const res = await axios.post(`${API}/leads`, payload, { headers: authHeaders() });
      toast.success(`Request sent. Estimated service fee: €${res.data.fee_eur}`);
      onRequest && onRequest();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Could not send request");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg" data-testid="request-dialog">
      <DialogHeader>
        <DialogTitle>{manager.name} anfragen</DialogTitle>
        <DialogDescription>Nur eingeloggte und verifizierte Unternehmen können Manager kontaktieren. Konditionen besprechen wir individuell mit Ihnen.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Unternehmen</Label><Input data-testid="req-company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Ihre Firma" /></div>
          <div><Label>Ansprechpartner</Label><Input data-testid="req-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ihr Name" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>E-Mail</Label><Input data-testid="req-email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sie@firma.com" /></div>
          <div><Label>Tage</Label><Input data-testid="req-days" type="number" min={1} value={days} onChange={e => setDays(e.target.value)} /></div>
        </div>
        <div>
          <Label>Startdatum</Label>
          <div className="rounded-md border p-2"><Calendar mode="single" selected={startDate} onSelect={setStartDate} className="rounded-md" /></div>
        </div>
        <div><Label>Nachricht</Label><Textarea data-testid="req-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Beschreiben Sie kurz Ihr Anliegen" /></div>
      </div>
      <DialogFooter>
        <Button className="btn-primary" onClick={submit} data-testid="req-submit">Anfrage senden</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---------------- Availability ----------------
function nextNWeekStarts(n = 12) {
  const out = [];
  const now = new Date();
  // Find Monday of current week
  const day = now.getDay(); // 0=Sun..6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const AVAIL_COLORS = { available: "#16a34a", booked: "#dc2626", tentative: "#f59e0b" };

function AvailabilityCalendar({ managerId, editable, onSaved }) {
  const [slotsByDate, setSlotsByDate] = useState({});
  const [saving, setSaving] = useState(false);
  const weeks = nextNWeekStarts(12);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/managers/${managerId}/availability`);
        if (cancelled) return;
        const map = {};
        (res.data?.slots || []).forEach(s => { map[s.week_start] = s.status; });
        setSlotsByDate(map);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [managerId]);

  const cycle = (w) => {
    if (!editable) return;
    const cur = slotsByDate[w] || "available";
    const order = ["available", "tentative", "booked"];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setSlotsByDate(prev => ({ ...prev, [w]: next }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const slots = weeks.map(w => ({ week_start: w, status: slotsByDate[w] || "available" }));
      await axios.put(`${API}/managers/${managerId}/availability`, { slots }, { headers: authHeaders() });
      toast.success("Availability saved");
      onSaved && onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3" data-testid="availability-calendar">
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
        {weeks.map(w => {
          const status = slotsByDate[w] || "available";
          const date = new Date(w);
          const label = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
          return (
            <button
              key={w}
              type="button"
              onClick={() => cycle(w)}
              className="rounded-md border p-2 text-xs text-white font-semibold transition-transform hover:scale-105"
              style={{ background: AVAIL_COLORS[status], cursor: editable ? "pointer" : "default" }}
              data-testid={`avail-${w}`}
              title={`Woche vom ${label} — ${status}`}
            >
              <div>KW {Math.ceil(((date - new Date(date.getFullYear(), 0, 1)) / 86400000 + 1) / 7)}</div>
              <div className="opacity-90">{label}</div>
            </button>
          );
        })}
      </div>
      <div className="text-xs opacity-70 flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: AVAIL_COLORS.available }}></span>Verfügbar</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: AVAIL_COLORS.tentative }}></span>Reserviert</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: AVAIL_COLORS.booked }}></span>Gebucht</span>
        {editable && <span className="opacity-60">Klicken zum Umschalten</span>}
      </div>
      {editable && (
        <Button className="btn-primary" disabled={saving} onClick={save} data-testid="avail-save">
          {saving ? "Speichere…" : "Verfügbarkeit speichern"}
        </Button>
      )}
    </div>
  );
}

// ---------------- AI Matching (Clients) ----------------
function AIMatchingFlow({ user, ensureAuth }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: "", description: "", required_skills: "", sector: "",
    duration_days: 90, budget_eur_per_day: 1200, location: "",
  });
  const [project, setProject] = useState(null);
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState(false);

  if (!user || user.role !== "client" || !user.client_approved) {
    return (
      <Card data-testid="ai-matching-gate">
        <CardHeader>
          <CardTitle>KI-Matching</CardTitle>
          <CardDescription>
            {!user ? "Bitte einloggen, um ein Projekt einzustellen." :
              !user.client_approved ? "Ihr Unternehmens-Account wird gerade geprüft. Sobald freigeschaltet, können Sie Projekte einstellen und KI-Matching nutzen." :
              "Nur Unternehmens-Accounts können Projekte einstellen."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const createProject = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/projects`, {
        title: form.title,
        description: form.description,
        required_skills: form.required_skills.split(",").map(s => s.trim()).filter(Boolean),
        sector: form.sector || null,
        duration_days: Number(form.duration_days) || null,
        budget_eur_per_day: Number(form.budget_eur_per_day) || null,
        location: form.location || null,
      }, { headers: authHeaders() });
      setProject(res.data);
      setStep(2);
      toast.success("Projekt erstellt");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create"); }
    finally { setBusy(false); }
  };

  const runMatch = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/projects/${project.id}/match`, {}, { headers: authHeaders() });
      setMatches(res.data.matches || []);
      setStep(3);
    } catch (e) { toast.error(e?.response?.data?.detail || "KI-Matching fehlgeschlagen"); }
    finally { setBusy(false); }
  };

  const steps = [
    { n: 1, label: "Projekt einstellen" },
    { n: 2, label: "KI-Matching" },
    { n: 3, label: "Kandidaten" },
    { n: 4, label: "Interview" },
    { n: 5, label: "Vertrag & Start" },
  ];

  return (
    <Card data-testid="ai-matching-flow">
      <CardHeader>
        <CardTitle>KI-Matching für Unternehmen</CardTitle>
        <CardDescription>In 5 Schritten zum passenden Interim Manager — KI-gestützt.</CardDescription>
        <div className="mt-3 flex items-center gap-1 overflow-x-auto" data-testid="matching-steps">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-1 flex-shrink-0">
              <div
                className={"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold " +
                  (step >= s.n ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500")}
              >{s.n}</div>
              <span className={"text-xs " + (step >= s.n ? "font-semibold" : "opacity-60")}>{s.label}</span>
              {i < steps.length - 1 && <span className="opacity-30">›</span>}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {step === 1 && (
          <div className="grid gap-3" data-testid="match-step-1">
            <div><Label>Projekttitel</Label><Input data-testid="match-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Interim CFO Maschinenbau" /></div>
            <div><Label>Beschreibung</Label><Textarea data-testid="match-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Mittelständischer Maschinenbauer benötigt CFO ad interim…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Sektor</Label><Input data-testid="match-sector" value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} placeholder="Maschinenbau" /></div>
              <div><Label>Standort</Label><Input data-testid="match-location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Stuttgart" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dauer (Tage)</Label><Input data-testid="match-duration" type="number" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: e.target.value })} /></div>
              <div><Label>Budget (€/Tag)</Label><Input data-testid="match-budget" type="number" value={form.budget_eur_per_day} onChange={e => setForm({ ...form, budget_eur_per_day: e.target.value })} /></div>
            </div>
            <div><Label>Gewünschte Skills (Komma)</Label><Input data-testid="match-skills" value={form.required_skills} onChange={e => setForm({ ...form, required_skills: e.target.value })} placeholder="Finance, Restrukturierung, M&A" /></div>
            <div className="flex justify-end"><Button className="btn-primary" disabled={busy || !form.title} onClick={createProject} data-testid="match-create">Projekt einstellen</Button></div>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-3 py-6 text-center" data-testid="match-step-2">
            <div className="text-lg font-semibold">Projekt "{project?.title}" steht.</div>
            <div className="opacity-80 text-sm">Lass die KI jetzt die Top-Kandidaten für dich ranken.</div>
            <div className="flex justify-center"><Button className="btn-primary" disabled={busy} onClick={runMatch} data-testid="match-run">{busy ? "KI analysiert…" : "KI-Matching starten"}</Button></div>
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-3" data-testid="match-step-3">
            <div className="text-sm opacity-80">Top {matches.length} Kandidaten (KI-Score 0–100):</div>
            {matches.map((m, i) => (
              <div key={m.manager_id || i} className="rounded-md border p-3 flex gap-3 items-center" data-testid={`match-result-${i}`}>
                <img src={m.image_url || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120"} alt="" className="w-14 h-14 rounded-md object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-semibold">{m.name}</span><Badge className="badge-skill">{m.title}</Badge></div>
                  <div className="text-xs opacity-80 mt-1">{m.rationale}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-700" data-testid={`match-score-${i}`}>{m.score}</div>
                  <div className="text-xs opacity-70">€{m.daily_rate_eur}/Tag</div>
                </div>
                <Link to={`/m/${m.manager_id}`}><Button variant="outline" data-testid={`match-view-${i}`}>Profil</Button></Link>
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="match-back">Zurück</Button>
              <Button className="btn-primary" onClick={() => setStep(4)} data-testid="match-next-interview">Interview anfragen</Button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="grid gap-3 py-6 text-center" data-testid="match-step-4">
            <div className="text-base">Buche ein 30-Min Video-Interview mit den Top-Kandidaten.</div>
            <div className="opacity-70 text-sm">Wir benachrichtigen die Manager per E-Mail; nach Bestätigung erscheint ein Kalendereintrag.</div>
            <Button className="btn-primary" onClick={() => setStep(5)} data-testid="match-next-contract">Weiter zu Vertrag</Button>
          </div>
        )}
        {step === 5 && (
          <div className="grid gap-3 py-6 text-center" data-testid="match-step-5">
            <div className="text-lg font-semibold">Vertragsabschluss & Projektstart</div>
            <div className="opacity-80 text-sm">Interimio stellt Ihnen eine Standard-Vertragsvorlage. Die Konditionen besprechen wir individuell mit Ihnen.</div>
            <Button className="btn-primary" onClick={() => { setStep(1); setProject(null); setMatches([]); }} data-testid="match-restart">Neues Projekt einstellen</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function ProfileCheckCard({ user }) {
  const [cv, setCv] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!user || user.role !== "manager") return null;

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await axios.post(`${API}/managers/me/profile-check`, { cv_text: cv || undefined }, { headers: authHeaders() });
      setResult(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "KI-Profilcheck fehlgeschlagen");
    } finally { setBusy(false); }
  };

  return (
    <Card className="mt-4" data-testid="profile-check-card">
      <CardHeader>
        <CardTitle>KI Profil-Check & Optimierung</CardTitle>
        <CardDescription>Lass dein Profil von der KI prüfen — Stärken, Lücken, optimierter Bio-Text.</CardDescription>
      </CardHeader>
      <CardContent>
        <Label>CV-Text einfügen (optional, für bessere Analyse)</Label>
        <Textarea
          data-testid="profile-check-cv"
          rows={4}
          value={cv}
          onChange={e => setCv(e.target.value)}
          placeholder="Lebenslauf hier einfügen — wirkt sich auf Vorschläge aus."
        />
        <div className="mt-3 flex gap-2">
          <Button className="btn-primary" disabled={busy} onClick={run} data-testid="profile-check-run">
            {busy ? "KI analysiert…" : "KI-Check starten"}
          </Button>
        </div>
        {result && (
          <div className="mt-4 space-y-3" data-testid="profile-check-result">
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold text-blue-700" data-testid="profile-check-score">{result.score}</div>
              <div className="text-sm opacity-80">/ 100 Profil-Qualitätsscore</div>
            </div>
            <div>
              <div className="text-xs uppercase opacity-60">Stärken</div>
              <ul className="list-disc ml-5 text-sm">{(result.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <div className="text-xs uppercase opacity-60">Verbesserungspotenzial</div>
              <ul className="list-disc ml-5 text-sm">{(result.gaps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            {result.suggested_title && (
              <div><span className="text-xs uppercase opacity-60">Vorgeschlagener Titel: </span><span className="font-semibold">{result.suggested_title}</span></div>
            )}
            {result.rewritten_bio && (
              <div>
                <div className="text-xs uppercase opacity-60">Optimierter Bio-Text</div>
                <div className="rounded-md border p-3 text-sm italic">{result.rewritten_bio}</div>
              </div>
            )}
            {result.suggested_skills?.length ? (
              <div>
                <div className="text-xs uppercase opacity-60">Empfohlene Skills</div>
                <div className="flex flex-wrap gap-1 mt-1">{result.suggested_skills.map((s, i) => <Badge key={i} className="badge-skill">{s}</Badge>)}</div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MyReferralCard({ user }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/referrals/me`, { headers: authHeaders() });
        if (!cancelled) setData(res.data);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user || user.role !== "manager") return null;
  if (!data) return null;

  const link = `${window.location.origin}/?ref=${data.referral_code}`;
  const tweet = `I just joined Interimio — Europe's marketplace for interim managers. Get 20% off with my link:`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
  const twUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(link)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Referral link copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <Card className="mt-4" data-testid="my-referral-card">
      <CardHeader>
        <CardTitle>Kollegen empfehlen — Gratis-Monate sammeln</CardTitle>
        <CardDescription>Jede erfolgreiche Empfehlung bringt dir +1 Gratis-Monat — auch während der Gratis-Aktion (angerechnet nach dem 30.06.2027).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-md border p-3">
            <div className="text-xs opacity-70">Your code</div>
            <div className="font-mono text-lg" data-testid="my-referral-code">{data.referral_code}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs opacity-70">Free months earned</div>
            <div className="text-2xl font-bold" data-testid="my-referral-credits">{data.credits_months}</div>
          </div>
        </div>
        <div className="rounded-md border p-3 text-xs font-mono break-all opacity-80">{link}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="btn-primary" onClick={copy} data-testid="copy-referral-link">Copy link</Button>
          <a href={liUrl} target="_blank" rel="noopener noreferrer" data-testid="share-referral-li"><Button variant="outline">Share on LinkedIn</Button></a>
          <a href={twUrl} target="_blank" rel="noopener noreferrer" data-testid="share-referral-tw"><Button variant="outline">Share on X</Button></a>
        </div>
        {data.referrals?.length ? (
          <div className="mt-4">
            <div className="text-xs opacity-70 mb-1">Recent referrals</div>
            <ul className="text-sm space-y-1" data-testid="my-referrals-list">
              {data.referrals.slice(0, 5).map(r => (
                <li key={r.id} className="flex items-center justify-between border-b py-1">
                  <span>{r.referee_email}</span>
                  <span className="opacity-70 text-xs">{r.billing_cycle} · {new Date(r.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MyPdfButton() {
  const [mid, setMid] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/managers/me/mine`, { headers: authHeaders() });
        if (!cancelled && res.data && res.data.id) setMid(res.data.id);
      } catch { /* no profile yet */ }
    })();
    return () => { cancelled = true; };
  }, []);
  if (!mid) return null;
  return (
    <a
      href={`${API}/managers/${mid}/pdf`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="my-pdf-btn"
    ><Button variant="outline">PDF One-Pager</Button></a>
  );
}

function ManagerPricing({ ensureManagerAuth, user, refreshUser, openRegister }) {
  const { settings } = useSettings();
  const [code, setCode] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [price, setPrice] = useState(299);
  const [basePrice, setBasePrice] = useState(299);
  const [applied, setApplied] = useState(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [referral, setReferral] = useState("");
  const [referralInfo, setReferralInfo] = useState(null);

  // Auto-detect ?ref= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("ref");
    if (r) setReferral(r.toUpperCase());
  }, []);

  // Validate referral code when entered
  useEffect(() => {
    if (!referral || referral.length < 6) { setReferralInfo(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/referrals/validate`, { params: { code: referral } });
        if (!cancelled) setReferralInfo(res.data.valid ? res.data : null);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [referral]);

  // Recompute price whenever cycle or code changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const params = { code: (code || "NONE").toUpperCase(), billing_cycle: billingCycle };
        const res = await axios.get(`${API}/discount-codes/validate`, { params });
        if (cancelled) return;
        const base = Number(res.data.base_price_eur);
        setBasePrice(base);
        let next = res.data.valid ? Number(res.data.final_price_eur) : base;
        let nextApplied = res.data.valid ? (res.data.applied || {}) : null;
        // Referral fallback / override: 20% off base if better than current
        if (referralInfo) {
          const refPrice = Math.round(base * 0.8);
          if (refPrice < next || nextApplied === null) {
            next = refPrice;
            nextApplied = { referral_percent_off: 20 };
          }
        }
        setPrice(next);
        setApplied(nextApplied);
      } catch {/* ignore */}
    };
    run();
    return () => { cancelled = true; };
  }, [billingCycle, code, referralInfo]);

  const seed = async () => {
    try {
      await axios.post(`${API}/discount-codes/seed`);
      toast.success("Demo codes loaded: SHARE10, PARTNER50, VIP100, JUNI");
    } catch { toast.error("Could not load demo codes"); }
  };

  const apply = async () => {
    if (!code.trim()) return;
    // Same as effect, but show toast
    try {
      const res = await axios.get(`${API}/discount-codes/validate`, { params: { code: code.toUpperCase(), billing_cycle: billingCycle } });
      if (res.data.valid) {
        setPrice(Number(res.data.final_price_eur));
        setApplied(res.data.applied || {});
        toast.success(`Code applied — €${res.data.final_price_eur} ${billingCycle === "yearly" ? "/year" : "/month"}`);
      } else {
        toast.error("Invalid or inactive code");
      }
    } catch { toast.error("Could not validate code"); }
  };

  const startCheckout = async () => {
    if (!ensureManagerAuth()) return;
    setLoadingCheckout(true);
    try {
      const res = await axios.post(
        `${API}/payments/checkout/session`,
        {
          origin_url: window.location.origin,
          discount_code: code ? code.toUpperCase() : undefined,
          referral_code: referral ? referral.toUpperCase() : undefined,
          billing_cycle: billingCycle,
        },
        { headers: authHeaders() }
      );
      if (res.data.url) window.location.href = res.data.url;
      else toast.error("Could not start checkout");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start checkout");
    } finally { setLoadingCheckout(false); }
  };

  const cycleLabel = billingCycle === "yearly" ? "/ year" : "/ month";

  // ---- Launch promo: free membership until free_until for signups before deadline ----
  const promoDeadline = settings?.launch_promo_signup_deadline || "2026-09-30";
  const promoFreeUntil = settings?.launch_promo_free_until || "2027-06-30";
  const promoActive = !!settings?.launch_promo_enabled && new Date() <= new Date(promoDeadline + "T23:59:59");
  const postPromoPrice = settings?.monthly_price_eur || 199;
  const fmtDate = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("de-DE"); } catch { return iso; } };
  const [claiming, setClaiming] = useState(false);
  const claimPromo = async () => {
    setClaiming(true);
    try {
      const res = await axios.post(`${API}/subscription/claim-launch-promo`, {}, { headers: authHeaders() });
      toast.success(`Mitgliedschaft aktiviert — kostenlos bis ${fmtDate(res.data.free_until || promoFreeUntil)}`);
      refreshUser && refreshUser();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Aktivierung fehlgeschlagen");
    } finally { setClaiming(false); }
  };

  if (promoActive) {
    return (
      <Card id="for-managers" className="card-hover border-blue-200" data-testid="manager-pricing">
        <CardHeader>
          <CardTitle>Für Interim Manager</CardTitle>
          <CardDescription>Jetzt Mitglied werden — aktuell komplett kostenlos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4" data-testid="launch-promo-banner">
            <div className="text-lg font-bold text-blue-900">Gratis-Aktion für Interim Manager</div>
            <p className="text-sm text-blue-900 mt-1">
              Registriere dich bis zum <b>{fmtDate(promoDeadline)}</b> und nutze Interimio{" "}
              <b>kostenlos bis zum {fmtDate(promoFreeUntil)}</b> — im Rahmen des Jahresvertrags, ohne Zahlungsdaten.
            </p>
            <p className="text-xs text-blue-800 mt-2" data-testid="post-promo-price">
              Danach: €{settings?.yearly_price_eur || 1999}/Jahr (gesamt) oder €{postPromoPrice}/Monat (netto).
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {user?.role === "manager" && user?.subscription_active ? (
              <>
                <Badge className="bg-green-600 text-white" data-testid="sub-active-badge">
                  Mitgliedschaft aktiv{user?.subscription_free_until ? ` — kostenlos bis ${fmtDate(user.subscription_free_until)}` : ""}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() => { window.dispatchEvent(new CustomEvent("open-onboarding")); }}
                  data-testid="reopen-onboarding-btn"
                >Profil bearbeiten / Onboarding</Button>
                <MyPdfButton />
              </>
            ) : user?.role === "manager" && user?.email_verified ? (
              <Button className="btn-primary" onClick={claimPromo} disabled={claiming} data-testid="claim-promo-btn">
                {claiming ? "Wird aktiviert…" : "Jetzt kostenlos freischalten"}
              </Button>
            ) : user?.role === "manager" ? (
              <div className="text-sm opacity-70" data-testid="promo-verify-hint">
                Bitte bestätige zuerst deine E-Mail-Adresse — danach wird deine kostenlose Mitgliedschaft automatisch aktiviert.
              </div>
            ) : (
              <Button className="btn-primary" onClick={() => openRegister && openRegister()} data-testid="promo-register-btn">
                Jetzt kostenlos registrieren
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="for-managers" className="card-hover" data-testid="manager-pricing">
      <CardHeader>
        <CardTitle>For Interim Managers</CardTitle>
        <CardDescription>Join Interimio — €{settings?.monthly_price_eur || 199}/Monat (netto). Email verification required.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4" role="tablist" data-testid="billing-toggle">
          <Button
            variant={billingCycle === "monthly" ? "default" : "outline"}
            className={billingCycle === "monthly" ? "btn-primary" : ""}
            onClick={() => setBillingCycle("monthly")}
            data-testid="billing-monthly"
          >Monthly</Button>
          <Button
            variant={billingCycle === "yearly" ? "default" : "outline"}
            className={billingCycle === "yearly" ? "btn-primary" : ""}
            onClick={() => setBillingCycle("yearly")}
            data-testid="billing-yearly"
          >Yearly · save</Button>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Referral code (friend invited you?)</Label>
            <Input data-testid="referral-input" value={referral} onChange={(e) => setReferral(e.target.value)} placeholder="REF-XXXXXX" />
          </div>
        </div>
        {referralInfo ? (
          <div className="mt-1 text-xs text-green-700" data-testid="referral-info">
            ✓ Valid — you save {referralInfo.referee_percent_off}% (invited by {referralInfo.referrer_email_masked})
          </div>
        ) : referral.length >= 6 ? (
          <div className="mt-1 text-xs text-red-600" data-testid="referral-invalid">Invalid referral code</div>
        ) : null}

        <div className="flex items-end gap-3 mt-3">
          <div className="flex-1">
            <Label>Discount code</Label>
            <Input data-testid="discount-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Try JUNI" />
          </div>
          <Button className="btn-primary" onClick={apply} data-testid="apply-discount-btn">Apply</Button>
          <Button className="btn-primary" onClick={seed} data-testid="load-demo-codes-btn">Load demo codes</Button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm">Your price</div>
          <div className="text-right">
            <div className="text-2xl font-bold" data-testid="final-price">€{price} <span className="text-sm font-normal opacity-70">{cycleLabel}</span></div>
            {applied && price !== basePrice ? (
              <div className="text-xs opacity-60 line-through" data-testid="base-price">€{basePrice} {cycleLabel}</div>
            ) : null}
          </div>
        </div>
        {applied ? (
          <div className="mt-2 text-sm text-green-700" data-testid="applied-info">
            Applied: {applied.percent_off ? `${applied.percent_off}%` :
                     applied.amount_off_eur ? `€${applied.amount_off_eur} off` :
                     applied.fixed_price_monthly_eur ? `Fixed €${applied.fixed_price_monthly_eur}/mo` :
                     applied.fixed_price_yearly_eur ? `Fixed €${applied.fixed_price_yearly_eur}/year` :
                     applied.referral_percent_off ? `Referral ${applied.referral_percent_off}% off` : ""}
          </div>
        ) : null}
        <div className="mt-5 flex gap-2">
          {user?.role === "manager" && user?.subscription_active ? (
            <>
              <Badge className="bg-green-600 text-white" data-testid="sub-active-badge">Subscription active</Badge>
              <Button
                variant="outline"
                onClick={() => { window.dispatchEvent(new CustomEvent("open-onboarding")); }}
                data-testid="reopen-onboarding-btn"
              >Edit profile / Onboarding</Button>
              <MyPdfButton />
            </>
          ) : (
            <Button
              className="btn-primary"
              onClick={startCheckout}
              disabled={loadingCheckout}
              data-testid="checkout-btn"
            >{loadingCheckout ? "Redirecting…" : `Subscribe — €${price} ${cycleLabel}`}</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Directory({ ensureAuth, user }) {
  const [filters, setFilters] = useState({ q: "", location: "", minRate: "", maxRate: "" });
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.q) params.append("q", filters.q);
      if (filters.location) params.append("location", filters.location);
      if (filters.minRate) params.append("min_rate", filters.minRate);
      if (filters.maxRate) params.append("max_rate", filters.maxRate);
      const res = await axios.get(`${API}/managers?${params.toString()}`, { headers: authHeaders() });
      setManagers(res.data || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load managers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchManagers(); }, [filters.q, filters.location, filters.minRate, filters.maxRate]);

  const requestRefresh = () => fetchManagers();

  return (
    <section id="browse" className="section" data-testid="directory-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Browse interim managers</h2>
            <p className="text-sm text-muted-foreground">Search by title, skills, location, and rate.</p>
          </div>
          <button className="btn-primary" onClick={async () => { await axios.post(`${API}/managers/seed`); toast.success("Sample profiles added"); fetchManagers(); }} data-testid="seed-managers-btn">Add sample profiles</button>
        </div>
        <div className="mt-6"><SearchBar values={filters} onChange={setFilters} /></div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="manager-grid">
          {loading ? (
            <div>Loading...</div>
          ) : managers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No managers found. Try broadening your search.</div>
          ) : (
            managers.map(m => (<ManagerCard key={m.id} m={m} user={user} />))
          )}
        </div>
      </div>
    </section>
  );
}

function RegisterDialog({ onDone }) {
  const { settings } = useSettings();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("client");
  const [companyName, setCompanyName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [step, setStep] = useState("form");
  const [otp, setOtp] = useState("");
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("ref");
    if (r) setReferralCode(r.toUpperCase());
  }, []);

  const submit = async () => {
    try {
      const payload = { email, phone, password, role };
      if (role === "client") payload.company_name = companyName;
      if (referralCode.trim()) payload.referral_code = referralCode.trim().toUpperCase();
      const res = await axios.post(`${API}/auth/register`, payload);
      setUserId(res.data.user_id);
      setStep("verify");
      if (role === "client") {
        toast.success("Registered. After email verification your account will be reviewed by our team for approval.");
      } else {
        toast.success("Registered. Check your email for the code");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not register");
    }
  };

  const resend = async () => {
    await axios.post(`${API}/auth/send-otp`, { user_id: userId, method: "email" });
    toast.success("OTP sent");
  };

  const verify = async () => {
    try {
      const res = await axios.post(`${API}/auth/verify-otp`, { user_id: userId, method: "email", code: otp });
      if (res.data?.launch_promo_free_until) {
        const until = new Date(res.data.launch_promo_free_until + "T00:00:00").toLocaleDateString("de-DE");
        toast.success(`E-Mail bestätigt! Deine Mitgliedschaft ist kostenlos aktiviert bis ${until}. Jetzt einloggen.`);
      } else {
        toast.success("Email verified. You can log in now.");
      }
      onDone && onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invalid code");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg" data-testid="register-dialog">
      <DialogHeader>
        <DialogTitle>Create account</DialogTitle>
        <DialogDescription>Select your role and verify by email to proceed.</DialogDescription>
      </DialogHeader>
      {step === "form" ? (
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input data-testid="register-email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></div>
            <div><Label>Phone (optional)</Label><Input data-testid="register-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+49..." /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Password</Label><Input data-testid="register-password" type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
            <div>
              <Label>Role</Label>
              <select data-testid="register-role" className="w-full border rounded-md h-10 px-2" value={role} onChange={e => setRole(e.target.value)}>
                <option value="client">Client (Company)</option>
                <option value="manager">Interim Manager</option>
              </select>
            </div>
          </div>
          {role === "manager" && settings?.launch_promo_enabled && (
            <div className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-md p-2" data-testid="register-promo-hint">
              Aktion: Bei Registrierung bis zum {new Date((settings?.launch_promo_signup_deadline || "2026-09-30") + "T00:00:00").toLocaleDateString("de-DE")} ist
              deine Mitgliedschaft kostenlos bis zum {new Date((settings?.launch_promo_free_until || "2026-12-31") + "T00:00:00").toLocaleDateString("de-DE")} (Jahresvertrag) —
              danach €{settings?.yearly_price_eur || 1999}/Jahr oder €{settings?.monthly_price_eur || 199}/Monat (netto).
            </div>
          )}
          {role === "manager" && (
            <div>
              <Label>Empfehlungscode (optional)</Label>
              <Input data-testid="register-referral" value={referralCode} onChange={e => setReferralCode(e.target.value)} placeholder="REF-XXXXXX" />
              <div className="text-xs opacity-70 mt-1">Wurdest du von einem Kollegen eingeladen? Er erhält +1 Gratis-Monat.</div>
            </div>
          )}
          {role === "client" && (
            <div>
              <Label>Company name</Label>
              <Input data-testid="register-company" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="ACME GmbH" />
              <div className="text-xs opacity-70 mt-1">Companies are manually reviewed after registration to ensure quality on the platform.</div>
            </div>
          )}
          <div className="flex justify-end pt-2"><Button className="btn-primary" onClick={submit} data-testid="register-submit">Register</Button></div>
        </div>
      ) : (
        <div className="grid gap-3 py-2">
          <div>
            <Label>Enter the 6-digit code (emailed)</Label>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map(i => (<InputOTPSlot key={i} index={i} />))}</InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button className="btn-primary" onClick={verify} data-testid="otp-verify-btn">Verify</Button>
            <Button className="btn-primary" onClick={resend} data-testid="otp-resend-btn">Resend</Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

function LoginDialog({ onDone, doLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async () => {
    try {
      await doLogin(email, password);
      onDone && onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Login failed");
    }
  };

  return (
    <DialogContent className="sm:max-w-md" data-testid="login-dialog">
      <DialogHeader>
        <DialogTitle>Login</DialogTitle>
        <DialogDescription>Access your Interimio account</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div><Label>Email</Label><Input data-testid="login-email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></div>
        <div><Label>Password</Label><Input data-testid="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <div className="flex justify-end pt-2"><Button className="btn-primary" onClick={submit} data-testid="login-submit">Login</Button></div>
      </div>
    </DialogContent>
  );
}

function LearningSection({ ensureAnyVerified, user, ensureLoginOnly }) {
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [level, setLevel] = useState("all");
  const [topic, setTopic] = useState("");

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (level) params.append("level", level);
      if (topic) params.append("tag", topic);
      const res = await axios.get(`${API}/courses?${params.toString()}`, { headers: authHeaders() });
      setCourses(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => { if (user) load(); }, [user, level, topic]);

  const seed = async () => { await axios.post(`${API}/courses/seed`); await load(); };

  if (!user) {
    return (
      <section id="learn" className="section" data-testid="learning-section">
        <div className="mx-auto max-w-7xl px-6">
          <Card>
            <CardHeader><CardTitle>Learning platform</CardTitle><CardDescription>Login to access courses and lessons</CardDescription></CardHeader>
            <CardContent><Button className="btn-primary" onClick={ensureLoginOnly} data-testid="learn-login-btn">Login to access</Button></CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section id="learn" className="section" data-testid="learning-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Learning platform</h2>
            <p className="text-sm text-muted-foreground">Courses, lessons, and progress tracking</p>
          </div>
          <button className="btn-primary" onClick={seed} data-testid="seed-courses-btn">Add sample courses</button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>Topic</Label><Input data-testid="course-topic" placeholder="e.g. Leadership" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
          <div>
            <Label>Level</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-full" data-testid="course-level"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Beginner">Beginner</SelectItem>
                <SelectItem value="Intermediate">Intermediate</SelectItem>
                <SelectItem value="Advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map(c => (
            <Card key={c.id} className="card-hover" data-testid={`course-card-${c.id}`}>
              <CardHeader><CardTitle>{c.title}</CardTitle><CardDescription>{c.level} • {(c.tags || []).join(", ")}</CardDescription></CardHeader>
              <CardContent>
                <p className="text-sm opacity-80">{c.description}</p>
                <div className="mt-4 flex justify-end">
                  <Dialog>
                    <DialogTrigger asChild><Button className="btn-primary" onClick={() => setSelected(c.id)} data-testid={`open-course-${c.id}`}>Open</Button></DialogTrigger>
                    <CourseDialog courseId={selected} ensureAnyVerified={ensureAnyVerified} />
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function CourseDialog({ courseId, ensureAnyVerified }) {
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [enrolled, setEnrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = async (id) => {
    if (!id) return;
    const res = await axios.get(`${API}/courses/${id}`, { headers: authHeaders() });
    setCourse(res.data.course);
    setLessons(res.data.lessons || []);
  };
  useEffect(() => { load(courseId); }, [courseId]);

  const enroll = async () => {
    if (!ensureAnyVerified()) return;
    const res = await axios.post(`${API}/enrollments`, { course_id: courseId }, { headers: authHeaders() });
    setEnrolled(true);
    setProgress(res.data.progress_percent || 0);
    toast.success("Enrolled");
  };

  const toggleComplete = async (lessonId, completed) => {
    const res = await axios.post(`${API}/enrollments/progress`, { course_id: courseId, lesson_id: lessonId, completed }, { headers: authHeaders() });
    setProgress(res.data.progress_percent);
  };

  if (!course) return <DialogContent className="sm:max-w-2xl">Loading…</DialogContent>;

  return (
    <DialogContent className="sm:max-w-2xl" data-testid="course-dialog">
      <DialogHeader><DialogTitle>{course.title}</DialogTitle><DialogDescription>{course.description}</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm opacity-70" data-testid="course-progress">Progress: {progress}%</div>
        {!enrolled && (<div className="flex justify-end"><Button className="btn-primary" onClick={enroll} data-testid="enroll-btn">Enroll</Button></div>)}
        <div className="space-y-2">
          {lessons.map((l, idx) => (
            <Card key={l.id} data-testid={`lesson-card-${l.id}`}>
              <CardHeader><CardTitle className="text-base">{idx + 1}. {l.title}</CardTitle><CardDescription>{l.duration_minutes || 5} min</CardDescription></CardHeader>
              <CardContent>
                {l.video_url ? (
                  <div className="aspect-video w-full overflow-hidden rounded-md">
                    <iframe title={l.title} src={l.video_url} width="100%" height="100%" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen></iframe>
                  </div>
                ) : null}
                {l.content ? (<p className="mt-3 text-sm opacity-80">{l.content}</p>) : null}
                <div className="mt-3 flex justify-end gap-2">
                  <Button className="btn-primary" onClick={() => toggleComplete(l.id, true)} data-testid={`complete-lesson-${l.id}`}>Mark completed</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DialogContent>
  );
}

function PodcastAddDialog({ onAdded }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");

  const submit = async () => {
    try {
      await axios.post(`${API}/podcasts`, { title, description: desc, podigee_iframe_url: url }, { headers: authHeaders() });
      toast.success("Episode added");
      onAdded && onAdded();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add episode (manager only)");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg" data-testid="podcast-add-dialog">
      <DialogHeader><DialogTitle>Add episode</DialogTitle><DialogDescription>Paste Podigee iframe URL (ends with /embed)</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Title</Label><Input data-testid="podcast-add-title" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><Label>Description</Label><Textarea data-testid="podcast-add-desc" value={desc} onChange={e => setDesc(e.target.value)} /></div>
        <div><Label>Podigee iframe URL</Label><Input data-testid="podcast-add-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yourpodcast.podigee.io/1-episode/embed" /></div>
        <div className="flex justify-end"><Button className="btn-primary" onClick={submit} data-testid="podcast-add-submit">Save</Button></div>
      </div>
    </DialogContent>
  );
}

function PodcastRSSSyncDialog({ onSynced }) {
  const [rssUrl, setRssUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!rssUrl) return;
    setBusy(true);
    try {
      const res = await axios.post(`${API}/podcasts/sync-rss`, { rss_url: rssUrl, max_episodes: 25 }, { headers: authHeaders() });
      toast.success(`Synced — added ${res.data.created}, skipped ${res.data.skipped}`);
      onSynced && onSynced();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "RSS sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg" data-testid="rss-sync-dialog">
      <DialogHeader>
        <DialogTitle>Sync from Podigee RSS</DialogTitle>
        <DialogDescription>Paste your Podigee podcast RSS feed URL. We fetch up to 25 latest episodes automatically.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div><Label>RSS feed URL</Label><Input data-testid="rss-url-input" value={rssUrl} onChange={e => setRssUrl(e.target.value)} placeholder="https://yourpodcast.podigee.io/feed/mp3" /></div>
        <div className="flex justify-end"><Button className="btn-primary" disabled={busy} onClick={submit} data-testid="rss-sync-submit">{busy ? "Syncing…" : "Sync now"}</Button></div>
      </div>
    </DialogContent>
  );
}

function PodcastSection({ user, ensureLoginOnly }) {
  const [eps, setEps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [openRss, setOpenRss] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${API}/podcasts`, { headers: authHeaders() });
      setEps(res.data || []);
      if ((!selected || !res.data.find(e => e.id === selected?.id)) && res.data && res.data.length) setSelected(res.data[0]);
    } catch (e) {
      // not logged in or error
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const seed = async () => { await axios.post(`${API}/podcasts/seed`); await load(); };

  if (!user) {
    return (
      <section id="podiac" className="section" data-testid="podiac-section">
        <div className="mx-auto max-w-7xl px-6">
          <Card>
            <CardHeader><CardTitle>Interimio Podcast</CardTitle><CardDescription>Login to access the member-only podcast area</CardDescription></CardHeader>
            <CardContent><Button className="btn-primary" onClick={ensureLoginOnly} data-testid="podiac-login-btn">Login to access</Button></CardContent>
          </Card>
        </div>
      </section>
    );
  }

  const canEdit = user.role === "manager" || user.role === "admin";

  return (
    <section id="podiac" className="section" data-testid="podiac-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Interimio Podcast</h2>
            <p className="text-sm text-muted-foreground">Member area — Podigee player</p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button className="btn-primary" onClick={seed} data-testid="podiac-seed-btn">Add sample episodes</button>
              <Dialog open={openAdd} onOpenChange={setOpenAdd}>
                <DialogTrigger asChild><Button className="btn-primary" data-testid="podiac-add-open">Add episode</Button></DialogTrigger>
                <PodcastAddDialog onAdded={() => { setOpenAdd(false); load(); }} />
              </Dialog>
              <Dialog open={openRss} onOpenChange={setOpenRss}>
                <DialogTrigger asChild><Button className="btn-primary" data-testid="podiac-rss-open">Sync RSS</Button></DialogTrigger>
                <PodcastRSSSyncDialog onSynced={() => { setOpenRss(false); load(); }} />
              </Dialog>
            </div>
          )}
        </div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {selected ? (
              <div className="aspect-video w-full overflow-hidden rounded-md" data-testid="podiac-player">
                <iframe title={selected.title} src={selected.podigee_iframe_url} width="100%" height="100%" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
              </div>
            ) : (
              <div className="text-sm opacity-70">No episode selected</div>
            )}
          </div>
          <div className="space-y-3" data-testid="podiac-list">
            {eps.map(ep => (
              <Card key={ep.id} className="cursor-pointer hover:shadow" onClick={() => setSelected(ep)} data-testid={`podiac-episode-${ep.id}`}>
                <CardHeader>
                  <CardTitle className="text-base">{ep.title}</CardTitle>
                  <CardDescription>{ep.publish_date ? new Date(ep.publish_date).toDateString() : ""}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const copy = (settings && settings[`footer_copy_${lang}`]) || t("footer_copy");
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="text-sm">© {new Date().getFullYear()} Interimio</div>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link to="/impressum" className="hover:underline" data-testid="footer-impressum">Impressum</Link>
          <Link to="/datenschutz" className="hover:underline" data-testid="footer-datenschutz">Datenschutz</Link>
          <Link to="/agb" className="hover:underline" data-testid="footer-agb">AGB</Link>
          <a href={`mailto:${(settings && settings.contact_email) || "kontakt@interimio.eu"}`} className="hover:underline" data-testid="footer-contact">Kontakt</a>
        </nav>
        <div className="text-sm opacity-70">{copy}</div>
      </div>
    </footer>
  );
}

// ---------------- Admin Page ----------------
function AdminCodesTab({ codes, reload }) {
  const [newCode, setNewCode] = useState({ code: "", percent_off: "", amount_off_eur: "", assigned_to: "", notes: "" });

  const createCode = async () => {
    const body = {
      code: (newCode.code || "").toUpperCase(),
      percent_off: newCode.percent_off ? Number(newCode.percent_off) : null,
      amount_off_eur: newCode.amount_off_eur ? Number(newCode.amount_off_eur) : null,
      assigned_to: newCode.assigned_to || null,
      notes: newCode.notes || null,
      is_active: true,
    };
    try {
      await axios.post(`${API}/discount-codes`, body, { headers: authHeaders() });
      toast.success("Code created");
      setNewCode({ code: "", percent_off: "", amount_off_eur: "", assigned_to: "", notes: "" });
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create code");
    }
  };

  const toggleActive = async (c) => {
    try { await axios.patch(`${API}/admin/discount-codes/${c.id}`, { is_active: !c.is_active }, { headers: authHeaders() }); reload(); }
    catch { toast.error("Failed to update code"); }
  };

  const removeCode = async (c) => {
    if (!window.confirm(`Delete code ${c.code}?`)) return;
    try { await axios.delete(`${API}/admin/discount-codes/${c.id}`, { headers: authHeaders() }); toast.success("Code deleted"); reload(); }
    catch { toast.error("Failed to delete code"); }
  };

  return (
    <Card data-testid="admin-codes-card">
      <CardHeader><CardTitle>Discount Codes</CardTitle><CardDescription>Create, deactivate and assign codes to shareholders or partners.</CardDescription></CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-6 gap-2 items-end">
          <div><Label>Code</Label><Input data-testid="new-code-code" value={newCode.code} onChange={e => setNewCode({ ...newCode, code: e.target.value })} placeholder="VIP25" /></div>
          <div><Label>% off</Label><Input data-testid="new-code-percent" type="number" value={newCode.percent_off} onChange={e => setNewCode({ ...newCode, percent_off: e.target.value })} /></div>
          <div><Label>€ off</Label><Input data-testid="new-code-amount" type="number" value={newCode.amount_off_eur} onChange={e => setNewCode({ ...newCode, amount_off_eur: e.target.value })} /></div>
          <div><Label>Assigned to</Label><Input data-testid="new-code-assigned" value={newCode.assigned_to} onChange={e => setNewCode({ ...newCode, assigned_to: e.target.value })} placeholder="Shareholders" /></div>
          <div><Label>Notes</Label><Input data-testid="new-code-notes" value={newCode.notes} onChange={e => setNewCode({ ...newCode, notes: e.target.value })} /></div>
          <Button className="btn-primary" onClick={createCode} data-testid="new-code-submit">Create</Button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm" data-testid="codes-table">
            <thead className="text-left opacity-70"><tr><th className="py-2">Code</th><th>Discount</th><th>Assigned to</th><th>Active</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.id} className="border-t" data-testid={`code-row-${c.id}`}>
                  <td className="py-2 font-mono">{c.code}</td>
                  <td>{c.percent_off ? `${c.percent_off}%` : c.amount_off_eur ? `€${c.amount_off_eur}` : "—"}</td>
                  <td>{c.assigned_to || "—"}</td>
                  <td>{c.is_active ? "Yes" : "No"}</td>
                  <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</td>
                  <td className="flex gap-2 py-2">
                    <Button variant="outline" onClick={() => toggleActive(c)} data-testid={`code-toggle-${c.id}`}>{c.is_active ? "Deactivate" : "Activate"}</Button>
                    <Button variant="destructive" onClick={() => removeCode(c)} data-testid={`code-delete-${c.id}`}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminLeadsTab({ leads }) {
  const exportCsv = () => {
    const token = localStorage.getItem("access_token");
    fetch(`${API}/admin/leads.csv`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "interimio-leads.csv"; a.click();
        URL.revokeObjectURL(url);
      });
  };
  return (
    <Card data-testid="admin-leads-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <div><CardTitle>Lead Inbox</CardTitle><CardDescription>All client requests with service fee projection (20–30%).</CardDescription></div>
        <Button className="btn-primary" onClick={exportCsv} data-testid="leads-export-csv">Export CSV</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="leads-table">
            <thead className="text-left opacity-70"><tr><th className="py-2">Date</th><th>KI-Score</th><th>Manager</th><th>Company</th><th>Contact</th><th>Days</th><th>Rate</th><th>Fee</th></tr></thead>
            <tbody>
              {leads.map(l => {
                const score = l.ai_score || null;
                const badge = score === "hot" ? "bg-red-100 text-red-800" : score === "warm" ? "bg-yellow-100 text-yellow-800" : score === "cold" ? "bg-gray-200 text-gray-700" : "bg-slate-100 text-slate-500";
                return (
                  <tr key={l.id} className="border-t" data-testid={`lead-row-${l.id}`}>
                    <td className="py-2">{l.created_at ? new Date(l.created_at).toLocaleDateString() : ""}</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded ${badge}`} title={l.ai_reasoning || ""}>{score ? score.toUpperCase() : "—"}</span>
                    </td>
                    <td>{l.manager_name} <span className="opacity-60">{l.manager_title}</span></td>
                    <td>{l.company_name}</td>
                    <td>{l.contact_name} <span className="opacity-60">({l.email})</span></td>
                    <td>{l.days}</td>
                    <td>€{l.daily_rate_eur}</td>
                    <td className="font-semibold">€{l.fee_eur}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ManagerEditDialog({ manager, onSaved }) {
  const [m, setM] = useState({
    name: manager.name || "", title: manager.title || "", location: manager.location || "",
    daily_rate_eur: manager.daily_rate_eur || 0, bio: manager.bio || "", skills: (manager.skills || []).join(", "),
    image_url: manager.image_url || "",
  });
  const save = async () => {
    try {
      await axios.patch(`${API}/managers/${manager.id}`, {
        ...m,
        daily_rate_eur: Number(m.daily_rate_eur),
        skills: m.skills.split(",").map(s => s.trim()).filter(Boolean),
      }, { headers: authHeaders() });
      toast.success("Manager updated");
      onSaved && onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };
  return (
    <DialogContent className="sm:max-w-xl" data-testid={`manager-edit-${manager.id}`}>
      <DialogHeader><DialogTitle>Edit manager</DialogTitle><DialogDescription>Update profile fields. Skills are comma-separated.</DialogDescription></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name</Label><Input value={m.name} onChange={e => setM({ ...m, name: e.target.value })} /></div>
          <div><Label>Title</Label><Input value={m.title} onChange={e => setM({ ...m, title: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Location</Label><Input value={m.location} onChange={e => setM({ ...m, location: e.target.value })} /></div>
          <div><Label>Daily rate (€)</Label><Input type="number" value={m.daily_rate_eur} onChange={e => setM({ ...m, daily_rate_eur: e.target.value })} /></div>
        </div>
        <div><Label>Image URL</Label><Input value={m.image_url} onChange={e => setM({ ...m, image_url: e.target.value })} /></div>
        <div><Label>Skills (comma)</Label><Input value={m.skills} onChange={e => setM({ ...m, skills: e.target.value })} /></div>
        <div><Label>Bio</Label><Textarea value={m.bio} onChange={e => setM({ ...m, bio: e.target.value })} /></div>
      </div>
      <DialogFooter><Button className="btn-primary" onClick={save} data-testid="manager-edit-save">Save</Button></DialogFooter>
    </DialogContent>
  );
}

function AdminManagersTab() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const reload = async () => {
    const res = await axios.get(`${API}/managers`);
    setItems(res.data || []);
  };
  useEffect(() => { reload(); }, []);
  const remove = async (m) => {
    if (!window.confirm(`Delete manager ${m.name}?`)) return;
    try { await axios.delete(`${API}/managers/${m.id}`, { headers: authHeaders() }); toast.success("Deleted"); reload(); }
    catch { toast.error("Delete failed"); }
  };
  return (
    <Card data-testid="admin-managers-card">
      <CardHeader><CardTitle>Managers</CardTitle><CardDescription>Edit profiles or remove entries.</CardDescription></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-70"><tr><th className="py-2">Name</th><th>Title</th><th>Location</th><th>Rate</th><th></th></tr></thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id} className="border-t" data-testid={`mgr-row-${m.id}`}>
                  <td className="py-2">{m.name}</td>
                  <td>{m.title}</td>
                  <td>{m.location}</td>
                  <td>€{m.daily_rate_eur}</td>
                  <td className="flex gap-2 py-2">
                    <Dialog open={editing === m.id} onOpenChange={(o) => setEditing(o ? m.id : null)}>
                      <DialogTrigger asChild><Button variant="outline" data-testid={`mgr-edit-${m.id}`}>Edit</Button></DialogTrigger>
                      <ManagerEditDialog manager={m} onSaved={() => { setEditing(null); reload(); }} />
                    </Dialog>
                    <Button variant="destructive" onClick={() => remove(m)} data-testid={`mgr-delete-${m.id}`}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminCoursesTab() {
  const [courses, setCourses] = useState([]);
  const [nc, setNc] = useState({ title: "", description: "", level: "Beginner", tags: "" });
  const reload = async () => {
    const res = await axios.get(`${API}/courses`, { headers: authHeaders() });
    setCourses(res.data || []);
  };
  useEffect(() => { reload(); }, []);
  const create = async () => {
    try {
      await axios.post(`${API}/courses`, {
        title: nc.title, description: nc.description, level: nc.level,
        tags: nc.tags.split(",").map(s => s.trim()).filter(Boolean), published: true,
      }, { headers: authHeaders() });
      toast.success("Course created"); setNc({ title: "", description: "", level: "Beginner", tags: "" }); reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Create failed"); }
  };
  const togglePublish = async (c) => {
    try { await axios.patch(`${API}/courses/${c.id}`, { published: !c.published }, { headers: authHeaders() }); reload(); }
    catch { toast.error("Update failed"); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete course ${c.title} (incl. lessons)?`)) return;
    try { await axios.delete(`${API}/courses/${c.id}`, { headers: authHeaders() }); toast.success("Deleted"); reload(); }
    catch { toast.error("Delete failed"); }
  };
  return (
    <Card data-testid="admin-courses-card">
      <CardHeader><CardTitle>Courses</CardTitle><CardDescription>Create and curate the learning catalog.</CardDescription></CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-5 gap-2 items-end">
          <div><Label>Title</Label><Input data-testid="new-course-title" value={nc.title} onChange={e => setNc({ ...nc, title: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Description</Label><Input data-testid="new-course-desc" value={nc.description} onChange={e => setNc({ ...nc, description: e.target.value })} /></div>
          <div>
            <Label>Level</Label>
            <Select value={nc.level} onValueChange={(v) => setNc({ ...nc, level: v })}>
              <SelectTrigger data-testid="new-course-level"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Beginner">Beginner</SelectItem>
                <SelectItem value="Intermediate">Intermediate</SelectItem>
                <SelectItem value="Advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Tags (comma)</Label><Input data-testid="new-course-tags" value={nc.tags} onChange={e => setNc({ ...nc, tags: e.target.value })} /></div>
        </div>
        <div className="mt-3 flex justify-end"><Button className="btn-primary" onClick={create} data-testid="new-course-submit">Create course</Button></div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-70"><tr><th className="py-2">Title</th><th>Level</th><th>Tags</th><th>Published</th><th></th></tr></thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.id} className="border-t" data-testid={`course-row-${c.id}`}>
                  <td className="py-2">{c.title}</td>
                  <td>{c.level}</td>
                  <td>{(c.tags || []).join(", ")}</td>
                  <td>{c.published ? "Yes" : "No"}</td>
                  <td className="flex gap-2 py-2">
                    <Button variant="outline" onClick={() => togglePublish(c)} data-testid={`course-publish-${c.id}`}>{c.published ? "Unpublish" : "Publish"}</Button>
                    <Button variant="destructive" onClick={() => remove(c)} data-testid={`course-delete-${c.id}`}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminPodiacTab() {
  const [eps, setEps] = useState([]);
  const reload = async () => {
    try { const res = await axios.get(`${API}/podcasts`, { headers: authHeaders() }); setEps(res.data || []); }
    catch { /* ignore */ }
  };
  useEffect(() => { reload(); }, []);
  const remove = async (ep) => {
    if (!window.confirm(`Delete episode "${ep.title}"?`)) return;
    try { await axios.delete(`${API}/podcasts/${ep.id}`, { headers: authHeaders() }); toast.success("Deleted"); reload(); }
    catch { toast.error("Delete failed"); }
  };
  return (
    <Card data-testid="admin-podiac-card">
      <CardHeader><CardTitle>Podcast Episodes</CardTitle><CardDescription>Manage podcast inventory.</CardDescription></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-70"><tr><th className="py-2">Title</th><th>Date</th><th>Embed URL</th><th></th></tr></thead>
            <tbody>
              {eps.map(ep => (
                <tr key={ep.id} className="border-t" data-testid={`podiac-row-${ep.id}`}>
                  <td className="py-2">{ep.title}</td>
                  <td>{ep.publish_date}</td>
                  <td className="font-mono text-xs truncate max-w-[300px]">{ep.podigee_iframe_url}</td>
                  <td><Button variant="destructive" onClick={() => remove(ep)} data-testid={`podiac-delete-${ep.id}`}>Delete</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminUsersTab() {
  const [items, setItems] = useState([]);
  const reload = async () => {
    try { const res = await axios.get(`${API}/admin/users`, { headers: authHeaders() }); setItems(res.data || []); }
    catch { toast.error("Failed to load users"); }
  };
  useEffect(() => { reload(); }, []);
  const setRole = async (u, role) => {
    try { await axios.patch(`${API}/admin/users/${u.id}`, { role }, { headers: authHeaders() }); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };
  const toggleVerified = async (u) => {
    try { await axios.patch(`${API}/admin/users/${u.id}`, { email_verified: !u.email_verified }, { headers: authHeaders() }); reload(); }
    catch { toast.error("Update failed"); }
  };
  const toggleSub = async (u) => {
    try { await axios.patch(`${API}/admin/users/${u.id}`, { subscription_active: !u.subscription_active }, { headers: authHeaders() }); reload(); }
    catch { toast.error("Update failed"); }
  };
  const toggleApproved = async (u) => {
    try { await axios.patch(`${API}/admin/users/${u.id}`, { client_approved: !u.client_approved }, { headers: authHeaders() }); reload(); }
    catch { toast.error("Update failed"); }
  };
  const remove = async (u) => {
    if (!window.confirm(`Delete user ${u.email}?`)) return;
    try { await axios.delete(`${API}/admin/users/${u.id}`, { headers: authHeaders() }); toast.success("Deleted"); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };
  return (
    <Card data-testid="admin-users-card">
      <CardHeader><CardTitle>Users</CardTitle><CardDescription>Roles, verification and subscription overrides.</CardDescription></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-70"><tr><th className="py-2">Email</th><th>Company</th><th>Role</th><th>Verified</th><th>Approved</th><th>Sub</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {items.map(u => (
                <tr key={u.id} className="border-t" data-testid={`user-row-${u.id}`}>
                  <td className="py-2">{u.email}</td>
                  <td className="text-xs opacity-80">{u.company_name || "—"}</td>
                  <td>
                    <Select value={u.role} onValueChange={(v) => setRole(u, v)}>
                      <SelectTrigger data-testid={`user-role-${u.id}`} className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">client</SelectItem>
                        <SelectItem value="manager">manager</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td><Button variant="outline" onClick={() => toggleVerified(u)} data-testid={`user-verify-${u.id}`}>{u.email_verified ? "✓" : "—"}</Button></td>
                  <td>
                    {u.role === "client" ? (
                      <Button
                        variant={u.client_approved ? "default" : "outline"}
                        className={u.client_approved ? "btn-primary" : ""}
                        onClick={() => toggleApproved(u)}
                        data-testid={`user-approve-${u.id}`}
                      >{u.client_approved ? "Approved" : "Approve"}</Button>
                    ) : <span className="opacity-50 text-xs">n/a</span>}
                  </td>
                  <td><Button variant="outline" onClick={() => toggleSub(u)} data-testid={`user-sub-${u.id}`}>{u.subscription_active ? "active" : "off"}</Button></td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}</td>
                  <td><Button variant="destructive" onClick={() => remove(u)} data-testid={`user-delete-${u.id}`}>Delete</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminAITab() {
  const [briefing, setBriefing] = useState(null);
  const [sourcing, setSourcing] = useState(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [srcBusy, setSrcBusy] = useState(false);

  const sendBriefing = async () => {
    setBriefBusy(true);
    try {
      const res = await axios.post(`${API}/admin/daily-briefing/send`, {}, { headers: authHeaders() });
      setBriefing(res.data);
      toast.success(res.data.sent ? `Briefing an ${res.data.to} versendet` : "Mail-Versand fehlgeschlagen — bitte Resend prüfen");
    } catch (e) {
      toast.error("Briefing konnte nicht erstellt werden");
    } finally { setBriefBusy(false); }
  };

  const runSourcing = async () => {
    setSrcBusy(true);
    try {
      const res = await axios.post(`${API}/admin/ai-sourcing/run`, {}, { headers: authHeaders() });
      setSourcing(res.data);
      toast.success(`KI-Sourcing für ${res.data.count || 0} offene Leads abgeschlossen`);
    } catch {
      toast.error("KI-Sourcing fehlgeschlagen");
    } finally { setSrcBusy(false); }
  };

  return (
    <div className="grid gap-4" data-testid="admin-ai-tab">
      <Card>
        <CardHeader>
          <CardTitle>Daily Briefing</CardTitle>
          <CardDescription>Sendet dir die Tages-KPIs + heißeste Leads + neue Manager als HTML-Mail. Empfehlung: einmal morgens auslösen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="btn-primary" disabled={briefBusy} onClick={sendBriefing} data-testid="ai-send-briefing">
            {briefBusy ? "Erstelle…" : "Daily Briefing per Mail senden"}
          </Button>
          {briefing && (
            <pre className="text-xs bg-slate-50 p-3 rounded border overflow-auto" data-testid="ai-briefing-result">
              {JSON.stringify(briefing, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>KI-Sourcing</CardTitle>
          <CardDescription>Für jeden offenen Lead (letzte 7 Tage) sucht Claude die Top-3 passenden Manager aus dem Pool.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="btn-primary" disabled={srcBusy} onClick={runSourcing} data-testid="ai-run-sourcing">
            {srcBusy ? "Sourcing läuft…" : "KI-Sourcing jetzt ausführen"}
          </Button>
          {sourcing && Array.isArray(sourcing.items) && sourcing.items.length > 0 && (
            <div className="space-y-3" data-testid="ai-sourcing-result">
              {sourcing.items.map((item, i) => (
                <div key={i} className="border-l-4 border-blue-600 bg-blue-50 p-3 rounded text-sm">
                  <div className="font-semibold mb-2">{item.lead.company_name} · {item.lead.days} Tage · €{item.lead.fee_eur}</div>
                  <ol className="list-decimal pl-5 space-y-1">
                    {item.matches.map((m, j) => (
                      <li key={j}>
                        <b>{m.name}</b> <span className="opacity-70">(Score {m.score})</span> — {m.reasoning}
                      </li>
                    ))}
                    {!item.matches.length && <li className="opacity-60">Keine Treffer.</li>}
                  </ol>
                </div>
              ))}
            </div>
          )}
          {sourcing && sourcing.message && (
            <div className="text-sm opacity-70" data-testid="ai-sourcing-empty">{sourcing.message}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lead Qualifier</CardTitle>
          <CardDescription>Läuft automatisch im Hintergrund nach jedem neuen Lead und vergibt Score „hot/warm/cold" mit Begründung. Zu sehen im Tab „Leads".</CardDescription>
        </CardHeader>
      </Card>

      <VoiceAgentCard />
    </div>
  );
}

function VoiceAgentCard() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [twilioNum, setTwilioNum] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [provisionResult, setProvisionResult] = useState(null);

  const loadStatus = async () => {
    try {
      const res = await axios.get(`${API}/admin/voice/status`, { headers: authHeaders() });
      setStatus(res.data);
      if (res.data.configured_assistant_id) setAssistantId(res.data.configured_assistant_id);
      if (res.data.configured_twilio_number) setTwilioNum(res.data.configured_twilio_number);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadStatus(); }, []);

  const provision = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/admin/voice/provision`, {}, { headers: authHeaders() });
      setProvisionResult(res.data);
      setAssistantId(res.data.assistant_id);
      toast.success("Vapi-Agent provisioniert");
      loadStatus();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Provisioning fehlgeschlagen");
    } finally { setBusy(false); }
  };

  const attach = async () => {
    if (!twilioNum || !assistantId) { toast.error("Twilio-Nummer und Assistant-ID erforderlich"); return; }
    setBusy(true);
    try {
      const res = await axios.post(`${API}/admin/voice/attach-twilio`,
        { twilio_number: twilioNum, assistant_id: assistantId },
        { headers: authHeaders() });
      toast.success("Twilio-Nummer angebunden! Du kannst jetzt anrufen.");
      setProvisionResult(res.data);
      loadStatus();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Anbinden fehlgeschlagen");
    } finally { setBusy(false); }
  };

  return (
    <Card data-testid="voice-agent-card">
      <CardHeader>
        <CardTitle>Telefon-Agent (Vapi + Twilio)</CardTitle>
        <CardDescription>Interi nimmt Anrufe auf deiner Twilio-Nummer entgegen, qualifiziert Anfragen und legt sie als Leads an.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="border rounded p-3">
            <div className="text-xs opacity-60">Assistants in Vapi</div>
            <div className="text-2xl font-bold">{status?.assistants?.length ?? "…"}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs opacity-60">Verlinkte Nummern</div>
            <div className="text-2xl font-bold">{status?.phone_numbers?.length ?? "…"}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs opacity-60">Aktiv konfiguriert</div>
            <div className="text-sm font-mono break-all">{status?.configured_assistant_id || "—"}</div>
          </div>
        </div>

        <div className="space-y-2">
          <Button onClick={provision} disabled={busy} className="btn-primary" data-testid="voice-provision">
            {busy ? "Provisioniere…" : "Vapi-Agent (Interi) neu provisionieren"}
          </Button>
          <p className="text-xs opacity-70">Erstellt oder aktualisiert den KI-Assistenten in Vapi mit den aktuellen CMS-Texten + dem Lead-Tool. Idempotent — kein Datenverlust.</p>
        </div>

        <div className="border-t pt-4 space-y-2">
          <Label>Twilio-Nummer (z.B. +4915xxxxxxxx)</Label>
          <Input value={twilioNum} onChange={e => setTwilioNum(e.target.value)} placeholder="+49…" data-testid="voice-twilio-number" />
          <Label>Vapi Assistant-ID</Label>
          <Input value={assistantId} onChange={e => setAssistantId(e.target.value)} data-testid="voice-assistant-id" />
          <Button onClick={attach} disabled={busy || !twilioNum || !assistantId} className="btn-primary" data-testid="voice-attach">
            {busy ? "Verbinde…" : "Twilio-Nummer mit Vapi verbinden"}
          </Button>
          <p className="text-xs opacity-70">Sobald verbunden: Anrufe auf diese Nummer werden von Interi entgegengenommen. Twilio-Webhooks werden automatisch von Vapi gesetzt.</p>
        </div>

        {provisionResult && (
          <pre className="text-xs bg-slate-50 p-3 rounded border overflow-auto" data-testid="voice-result">
            {JSON.stringify(provisionResult, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function AdminContentTab() {
  const { settings, reload } = useSettings();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState("texts");

  useEffect(() => {
    // Wait until settings is actually populated (hero_h1_de is always in DEFAULTS)
    if (settings && settings.hero_h1_de && !form) {
      setForm({
        ...settings,
        categories: (settings.categories || []).join(", "),
      });
    }
  }, [settings, form]);

  if (!form) return <div className="p-4 text-sm opacity-70">Lade Einstellungen…</div>;

  const set = (k, v) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        categories: form.categories.split(",").map(s => s.trim()).filter(Boolean),
        monthly_price_eur: Number(form.monthly_price_eur) || 0,
        yearly_price_eur: Number(form.yearly_price_eur) || 0,
        commission_percent: Number(form.commission_percent) || 0,
        barometer_active_managers: Number(form.barometer_active_managers) || 0,
        barometer_available_this_week: Number(form.barometer_available_this_week) || 0,
        barometer_total_leads: Number(form.barometer_total_leads) || 0,
        barometer_avg_daily_rate_eur: Number(form.barometer_avg_daily_rate_eur) || 0,
      };
      await axios.patch(`${API}/admin/settings`, payload, { headers: authHeaders() });
      await reload();
      toast.success("Inhalte aktualisiert");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Konnte nicht speichern");
    } finally { setSaving(false); }
  };

  const Field = ({ label, k, type = "text", placeholder, multiline }) => (
    <div>
      <Label>{label}</Label>
      {multiline ? (
        <Textarea rows={4} value={form[k] || ""} onChange={e => set(k, e.target.value)} placeholder={placeholder} data-testid={`cms-${k}`} />
      ) : (
        <Input type={type} value={form[k] ?? ""} onChange={e => set(k, e.target.value)} placeholder={placeholder} data-testid={`cms-${k}`} />
      )}
    </div>
  );

  const sections = [
    { id: "texts", label: "Texte" },
    { id: "prices", label: "Preise" },
    { id: "barometer", label: "Barometer" },
    { id: "categories", label: "Kategorien" },
    { id: "images", label: "Bilder" },
    { id: "legal", label: "Impressum" },
  ];

  return (
    <div className="space-y-4" data-testid="admin-content-tab">
      <div className="flex flex-wrap gap-2">
        {sections.map(s => (
          <Button key={s.id} variant={section === s.id ? "default" : "outline"} size="sm" onClick={() => setSection(s.id)} data-testid={`cms-section-${s.id}`}>{s.label}</Button>
        ))}
      </div>

      {section === "texts" && (
        <Card><CardContent className="pt-6 grid gap-3">
          <Field k="hero_h1_de" label="Hero Überschrift (DE)" placeholder="Interim Management. Schnell. Geprüft. Persönlich." />
          <Field k="hero_h1_en" label="Hero headline (EN)" placeholder="Interim Management. Fast. Vetted. Personal." />
          <Field k="hero_sub_de" label="Hero Untertext (DE)" multiline />
          <Field k="hero_sub_en" label="Hero subtitle (EN)" multiline />
          <Field k="footer_copy_de" label="Footer-Hinweis (DE)" />
          <Field k="footer_copy_en" label="Footer note (EN)" />
        </CardContent></Card>
      )}

      {section === "prices" && (
        <Card><CardContent className="pt-6 grid gap-3">
          <Field k="monthly_price_eur" label="Monatspreis (€, netto)" type="number" placeholder="199" />
          <Field k="yearly_price_eur" label="Jahrespreis (€, netto)" type="number" placeholder="1300" />
          <Field k="commission_percent" label="Vermittlungs-/Servicegebühr (%)" type="number" placeholder="20" />
          <div className="border-t pt-3 grid gap-3">
            <p className="text-sm font-semibold">Gratis-Aktion (Launch-Promo)</p>
            <div>
              <Label>Aktion aktiv</Label>
              <select
                className="w-full border rounded-md h-10 px-2"
                value={String(form.launch_promo_enabled ?? true)}
                onChange={e => set("launch_promo_enabled", e.target.value === "true")}
                data-testid="cms-launch_promo_enabled"
              >
                <option value="true">Aktiv</option>
                <option value="false">Aus</option>
              </select>
            </div>
            <Field k="launch_promo_signup_deadline" label="Registrierung kostenlos möglich bis (JJJJ-MM-TT)" placeholder="2026-09-30" />
            <Field k="launch_promo_free_until" label="Mitgliedschaft kostenlos bis (JJJJ-MM-TT)" placeholder="2026-12-31" />
            <p className="text-xs opacity-70">Solange die Aktion aktiv ist, werden Manager nach E-Mail-Verifizierung automatisch kostenlos freigeschaltet (bis zum angegebenen Datum). Die Preiskarte zeigt dann nur die Aktion + den Preis danach.</p>
          </div>
          <p className="text-xs opacity-70">Hinweis: Stripe-Checkout liest die Preise weiterhin aus dem Backend (`BASE_SUBSCRIPTION_EUR` / `BASE_YEARLY_EUR`). Änderungen hier wirken sich aktuell auf die Anzeige der Preise auf der Seite aus — der tatsächliche Charge-Betrag wird beim Umstieg auf echtes Stripe-Subscription synchronisiert.</p>
        </CardContent></Card>
      )}

      {section === "categories" && (
        <Card><CardContent className="pt-6 grid gap-3">
          <Field k="categories" label="Kategorien (durch Komma getrennt)" placeholder="Transformation, Finance, HR, …" multiline />
        </CardContent></Card>
      )}

      {section === "barometer" && (
        <Card><CardContent className="pt-6 grid gap-3">
          <p className="text-xs opacity-70 -mb-1">Feste Zahlen für das Markt-Barometer auf der Startseite. Wert auf <b>0</b> = automatisch aus Datenbank berechnen.</p>
          <Field k="barometer_active_managers" label="Aktive Manager" type="number" placeholder="376" />
          <Field k="barometer_available_this_week" label="Verfügbar diese Woche" type="number" placeholder="311" />
          <Field k="barometer_total_leads" label="Mandatsanfragen insgesamt" type="number" placeholder="603" />
          <Field k="barometer_avg_daily_rate_eur" label="Ø Tagessatz (€) — 0 = auto" type="number" placeholder="0" />
        </CardContent></Card>
      )}

      {section === "images" && (
        <Card><CardContent className="pt-6 grid gap-3">
          <Field k="hero_image_url" label="Hero-Bild URL" placeholder="https://images.unsplash.com/…" />
          {form.hero_image_url && (
            <img src={form.hero_image_url} alt="Vorschau" className="rounded-md max-h-48 object-cover" />
          )}
          <p className="text-xs opacity-70">Tipp: Stock-Fotos z.B. von Unsplash (kostenlos) oder eigene Uploads ins Object Storage einbinden.</p>
        </CardContent></Card>
      )}

      {section === "legal" && (
        <Card><CardContent className="pt-6 grid gap-3">
          <Field k="impressum_company" label="Firmenname / Inhaber:in" placeholder="Till Müller GmbH" />
          <Field k="impressum_address" label="Anschrift (Straße + PLZ Ort)" multiline placeholder={"Musterstraße 1\n12345 Berlin\nDeutschland"} />
          <Field k="impressum_email" label="Kontakt-E-Mail" placeholder="kontakt@interimio.eu" />
          <Field k="impressum_phone" label="Telefon (optional)" />
          <Field k="impressum_responsible" label="Vertretungsberechtigte Person" />
          <Field k="impressum_register_court" label="Registergericht" placeholder="Amtsgericht Berlin" />
          <Field k="impressum_register_number" label="Registernummer" placeholder="HRB 12345" />
          <Field k="impressum_vat_id" label="USt-IdNr (§ 27a UStG)" placeholder="DE123456789" />
          <Field k="contact_email" label="Allgemeine Kontakt-E-Mail (Footer)" placeholder="kontakt@interimio.eu" />
          <div className="border-t pt-3 mt-2">
            <Field k="daily_briefing_email" label="Empfänger Daily-Briefing (täglich um 7 Uhr)" placeholder="till@interimio.eu" />
          </div>
        </CardContent></Card>
      )}

      <div className="sticky bottom-0 bg-white border-t pt-3 -mx-1 flex justify-end">
        <Button className="btn-primary" disabled={saving} onClick={save} data-testid="cms-save">{saving ? "Speichere…" : "Änderungen speichern"}</Button>
      </div>
    </div>
  );
}

function AdminCallsTab() {
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setError(null); setCalls(null);
    try {
      const res = await axios.get(`${API}/admin/voice/calls`, { headers: authHeaders() });
      setCalls(res.data || []);
    } catch (e) {
      setError(e?.response?.data?.detail || "Anrufe konnten nicht geladen werden");
      setCalls([]);
    }
  };
  useEffect(() => { load(); }, []);

  const fmtDur = (s) => s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("de-DE") : "—";

  return (
    <div className="space-y-3" data-testid="admin-calls-tab">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Voice-Agent Anrufe (Interi)</h3>
          <p className="text-xs opacity-70">Letzte Telefonate mit Transkript & Zusammenfassung — zur Optimierung des Agenten.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="calls-reload-btn">Aktualisieren</Button>
      </div>
      {error && <div className="text-sm text-red-600" data-testid="calls-error">{error}</div>}
      {calls === null && <div className="text-sm opacity-70">Lade Anrufe…</div>}
      {calls?.length === 0 && !error && <div className="text-sm opacity-70" data-testid="calls-empty">Noch keine Anrufe vorhanden.</div>}
      {(calls || []).map(c => (
        <Card key={c.id} data-testid={`call-${c.id}`}>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">{fmtDate(c.started_at)}</span>
                <span className="opacity-70"> · {c.customer_number || "Web-Call"} · {fmtDur(c.duration_seconds)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{c.status || "?"}</Badge>
                {c.ended_reason && <span className="text-xs opacity-60">{c.ended_reason}</span>}
                <Button variant="outline" size="sm" onClick={() => setOpenId(openId === c.id ? null : c.id)} data-testid={`call-toggle-${c.id}`}>
                  {openId === c.id ? "Zuklappen" : "Transkript"}
                </Button>
              </div>
            </div>
            {c.summary && <p className="text-sm mt-2 bg-blue-50 border border-blue-100 rounded-md p-2">{c.summary}</p>}
            {openId === c.id && (
              <div className="mt-3 space-y-2">
                {c.recording_url && (
                  <audio controls src={c.recording_url} className="w-full h-9" data-testid={`call-audio-${c.id}`} />
                )}
                <pre className="text-xs whitespace-pre-wrap bg-slate-50 border rounded-md p-3 max-h-80 overflow-y-auto" data-testid={`call-transcript-${c.id}`}>
                  {c.transcript || "Kein Transkript verfügbar."}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdminPage({ user }) {
  const [stats, setStats] = useState(null);
  const [codes, setCodes] = useState([]);
  const [leads, setLeads] = useState([]);

  const load = async () => {
    try {
      const [s, c, l] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers: authHeaders() }),
        axios.get(`${API}/admin/discount-codes`, { headers: authHeaders() }),
        axios.get(`${API}/admin/leads`, { headers: authHeaders() }),
      ]);
      setStats(s.data); setCodes(c.data || []); setLeads(l.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load admin data");
    }
  };
  useEffect(() => { if (user?.role === "admin") load(); }, [user]);

  if (!user) return <div className="p-8" data-testid="admin-login-required">Please login as admin.</div>;
  if (user.role !== "admin") return <div className="p-8" data-testid="admin-forbidden">Admin only.</div>;

  return (
    <section className="section" data-testid="admin-page">
      <div className="mx-auto max-w-7xl px-6 space-y-6">
        <h2 className="text-2xl font-semibold">Admin Dashboard</h2>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="admin-stats">
            <Card><CardHeader><CardTitle className="text-sm opacity-70">Users</CardTitle><CardDescription className="text-2xl font-bold text-gray-900">{stats.users}</CardDescription></CardHeader></Card>
            <Card><CardHeader><CardTitle className="text-sm opacity-70">Managers</CardTitle><CardDescription className="text-2xl font-bold text-gray-900">{stats.managers}</CardDescription></CardHeader></Card>
            <Card><CardHeader><CardTitle className="text-sm opacity-70">Leads</CardTitle><CardDescription className="text-2xl font-bold text-gray-900">{stats.leads}</CardDescription></CardHeader></Card>
            <Card><CardHeader><CardTitle className="text-sm opacity-70">Fee pipeline</CardTitle><CardDescription className="text-2xl font-bold text-gray-900">€{stats.fee_pipeline_eur}</CardDescription></CardHeader></Card>
            <Card><CardHeader><CardTitle className="text-sm opacity-70">Paid subs</CardTitle><CardDescription className="text-2xl font-bold text-gray-900">{stats.paid_subscriptions}</CardDescription></CardHeader></Card>
          </div>
        )}

        <Tabs defaultValue="content" data-testid="admin-tabs">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="content" data-testid="tab-content">Inhalte</TabsTrigger>
            <TabsTrigger value="ai" data-testid="tab-ai">KI-Agenten</TabsTrigger>
            <TabsTrigger value="codes" data-testid="tab-codes">Discount codes</TabsTrigger>
            <TabsTrigger value="leads" data-testid="tab-leads">Leads</TabsTrigger>
            <TabsTrigger value="managers" data-testid="tab-managers">Managers</TabsTrigger>
            <TabsTrigger value="courses" data-testid="tab-courses">Courses</TabsTrigger>
            <TabsTrigger value="podiac" data-testid="tab-podiac">Podcast</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="calls" data-testid="tab-calls">Anrufe</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="pt-4"><AdminContentTab /></TabsContent>
          <TabsContent value="ai" className="pt-4"><AdminAITab /></TabsContent>
          <TabsContent value="codes" className="pt-4"><AdminCodesTab codes={codes} reload={load} /></TabsContent>
          <TabsContent value="leads" className="pt-4"><AdminLeadsTab leads={leads} /></TabsContent>
          <TabsContent value="managers" className="pt-4"><AdminManagersTab /></TabsContent>
          <TabsContent value="courses" className="pt-4"><AdminCoursesTab /></TabsContent>
          <TabsContent value="podiac" className="pt-4"><AdminPodiacTab /></TabsContent>
          <TabsContent value="users" className="pt-4"><AdminUsersTab /></TabsContent>
          <TabsContent value="calls" className="pt-4"><AdminCallsTab /></TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function ShareCard() {
  const shareText = "I just joined Interimio — the European marketplace for interim managers.";
  const shareUrl = (typeof window !== "undefined" ? window.location.origin : "https://interimio.com");
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const twUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${shareText} ${shareUrl}`); toast.success("Copied to clipboard"); }
    catch { toast.error("Copy failed"); }
  };
  return (
    <Card className="mt-4" data-testid="share-card">
      <CardHeader>
        <CardTitle>Share your profile</CardTitle>
        <CardDescription>Help more clients find you — share that you’re live on Interimio.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <a href={liUrl} target="_blank" rel="noopener noreferrer" data-testid="share-linkedin">
            <Button className="btn-primary">Share on LinkedIn</Button>
          </a>
          <a href={twUrl} target="_blank" rel="noopener noreferrer" data-testid="share-twitter">
            <Button className="btn-primary" style={{ background: "#0a5db0" }}>Share on X / Twitter</Button>
          </a>
          <Button variant="outline" onClick={copy} data-testid="share-copy">Copy link</Button>
        </div>
        <div className="mt-3 rounded-md border p-3 text-sm opacity-80">{shareText} <span className="opacity-60">{shareUrl}</span></div>
      </CardContent>
    </Card>
  );
}

function OnboardingWizard({ user, refreshUser, onClose }) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({ name: "", title: "", location: "", daily_rate_eur: 1000, bio: "", skills: "", image_url: "" });
  const [rssUrl, setRssUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/managers/me`, {
        name: profile.name, title: profile.title, location: profile.location,
        daily_rate_eur: Number(profile.daily_rate_eur), bio: profile.bio,
        skills: profile.skills.split(",").map(s => s.trim()).filter(Boolean),
        image_url: profile.image_url || undefined,
      }, { headers: authHeaders() });
      toast.success("Profile created");
      await refreshUser();
      setStep(2);
    } catch (e) {
      // If profile already exists, fall through to next step (idempotent UX)
      if (e?.response?.status === 400 && /already exists/i.test(e?.response?.data?.detail || "")) {
        toast.info("Profile already exists — continuing");
        await refreshUser();
        setStep(2);
      } else {
        toast.error(e?.response?.data?.detail || "Could not create profile");
      }
    } finally { setBusy(false); }
  };

  const syncRss = async () => {
    if (!rssUrl) { setStep(3); return; }
    setBusy(true);
    try {
      const res = await axios.post(`${API}/podcasts/sync-rss`, { rss_url: rssUrl, max_episodes: 25 }, { headers: authHeaders() });
      toast.success(`Synced ${res.data.created} episode(s)`);
      setStep(3);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "RSS sync failed");
    } finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/auth/me/onboarding`, { onboarding_completed: true }, { headers: authHeaders() });
      await refreshUser();
      onClose && onClose();
      toast.success("You’re all set 🎉");
    } catch {
      onClose && onClose();
    } finally { setBusy(false); }
  };

  return (
    <DialogContent className="sm:max-w-xl" data-testid="onboarding-wizard">
      <DialogHeader>
        <DialogTitle>Welcome to Interimio Pro</DialogTitle>
        <DialogDescription>Step {step} of 3 — let’s get your profile discovered.</DialogDescription>
      </DialogHeader>
      {step === 1 && (
        <div className="grid gap-3 py-2" data-testid="onboarding-step-1">
          <p className="text-sm opacity-80">Tell clients who you are.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input data-testid="onb-name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Anna Richter" /></div>
            <div><Label>Title</Label><Input data-testid="onb-title" value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} placeholder="Interim CFO" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Location</Label><Input data-testid="onb-location" value={profile.location} onChange={e => setProfile({ ...profile, location: e.target.value })} placeholder="Berlin, DE" /></div>
            <div><Label>Daily rate (€)</Label><Input data-testid="onb-rate" type="number" value={profile.daily_rate_eur} onChange={e => setProfile({ ...profile, daily_rate_eur: e.target.value })} /></div>
          </div>
          <div><Label>Skills (comma)</Label><Input data-testid="onb-skills" value={profile.skills} onChange={e => setProfile({ ...profile, skills: e.target.value })} placeholder="Turnaround, M&A, FP&A" /></div>
          <div><Label>Profile image URL (optional)</Label><Input data-testid="onb-image" value={profile.image_url} onChange={e => setProfile({ ...profile, image_url: e.target.value })} placeholder="https://..." /></div>
          <div><Label>Short bio</Label><Textarea data-testid="onb-bio" value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} placeholder="15+ years leading turnarounds…" /></div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} data-testid="onb-skip-1">Skip</Button>
            <Button className="btn-primary" disabled={busy} onClick={saveProfile} data-testid="onb-save-1">Save & continue</Button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-3 py-2" data-testid="onboarding-step-2">
          <p className="text-sm opacity-80">Optional: connect your Podigee RSS feed to populate your podcast episodes automatically.</p>
          <div><Label>Podigee RSS URL</Label><Input data-testid="onb-rss" value={rssUrl} onChange={e => setRssUrl(e.target.value)} placeholder="https://yourpodcast.podigee.io/feed/mp3" /></div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)} data-testid="onb-skip-2">Skip</Button>
            <Button className="btn-primary" disabled={busy} onClick={syncRss} data-testid="onb-rss-sync">{busy ? "Syncing…" : "Sync & continue"}</Button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="grid gap-3 py-2" data-testid="onboarding-step-3">
          <p className="text-sm">You’re live. Share your Interimio profile to maximize visibility.</p>
          <ShareCard />
          <div className="flex justify-end">
            <Button className="btn-primary" disabled={busy} onClick={finish} data-testid="onb-finish">Finish</Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

// ---------------- Subscription pages ----------------
function SubscriptionSuccess({ refreshUser }) {
  const [status, setStatus] = useState("checking");
  const [info, setInfo] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sid = params.get("session_id");
    if (!sid) { setStatus("error"); return; }
    let attempts = 0;
    let timer;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await axios.get(`${API}/payments/checkout/status/${sid}`, { headers: authHeaders() });
        setInfo(res.data);
        if (res.data.payment_status === "paid") {
          setStatus("paid");
          await refreshUser();
          return;
        }
        if (res.data.status === "expired") { setStatus("expired"); return; }
        if (attempts >= 7) { setStatus("timeout"); return; }
        timer = setTimeout(poll, 2000);
      } catch (e) {
        setStatus("error");
      }
    };
    poll();
    return () => timer && clearTimeout(timer);
  }, []);

  return (
    <section className="section" data-testid="subscription-success">
      <div className="mx-auto max-w-3xl px-6">
        <Card>
          <CardHeader>
            <CardTitle data-testid="sub-status-title">
              {status === "paid" ? "Subscription active 🎉" : status === "checking" ? "Confirming your payment…" : status === "expired" ? "Session expired" : status === "timeout" ? "Still processing" : "Payment status"}
            </CardTitle>
            <CardDescription data-testid="sub-status-desc">
              {status === "paid" ? "Welcome to Interimio Pro. Your manager profile is now live-ready." :
                status === "checking" ? "We're verifying your payment with Stripe." :
                status === "expired" ? "Your checkout session expired. Please retry from the pricing card." :
                status === "timeout" ? "Stripe is still processing. You will receive an email confirmation." : "We couldn't verify the payment."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {info && (<div className="text-sm" data-testid="sub-info">Status: {info.status} · Payment: {info.payment_status} · Amount: €{info.final_price_eur}</div>)}
            <Button className="btn-primary" onClick={() => navigate("/")} data-testid="sub-back-home">Back to home</Button>
          </CardContent>
        </Card>
        {status === "paid" && <ShareCard />}
        {status === "paid" && <LoyaltyCodesCard />}
      </div>
    </section>
  );
}

function LoyaltyCodesCard() {
  const [codes, setCodes] = useState([]);
  const [copying, setCopying] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCodes = async () => {
      try {
        const res = await axios.get(`${API}/discount-codes/mine`, { headers: authHeaders() });
        if (!cancelled) setCodes(res.data || []);
      } catch { /* ignore */ }
    };
    fetchCodes();
    // Loyalty code is issued in the same paid transition — poll for ~10s
    const t = setInterval(fetchCodes, 2000);
    setTimeout(() => clearInterval(t), 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const copy = async (code) => {
    setCopying(code);
    try { await navigator.clipboard.writeText(code); toast.success(`Copied ${code}`); }
    catch { toast.error("Copy failed"); }
    setTimeout(() => setCopying(null), 1200);
  };

  if (!codes.length) return null;
  return (
    <Card className="mt-4" data-testid="loyalty-codes-card">
      <CardHeader>
        <CardTitle>Your loyalty codes</CardTitle>
        <CardDescription>Use these at next renewal — single-use, 5% off.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" data-testid="loyalty-codes-list">
          {codes.map(c => (
            <li key={c.id} className="flex items-center justify-between rounded-md border p-3" data-testid={`loyalty-row-${c.id}`}>
              <div>
                <div className="font-mono text-lg">{c.code}</div>
                <div className="text-xs opacity-70">
                  {c.percent_off ? `${c.percent_off}% off` : ""} ·{" "}
                  {c.expires_at ? `expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                  {c.used_at ? " · already used" : ""}
                </div>
              </div>
              <Button variant="outline" disabled={!!c.used_at} onClick={() => copy(c.code)} data-testid={`loyalty-copy-${c.id}`}>
                {copying === c.code ? "Copied!" : "Copy"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SubscriptionCancel() {
  const navigate = useNavigate();
  return (
    <section className="section" data-testid="subscription-cancel">
      <div className="mx-auto max-w-3xl px-6">
        <Card>
          <CardHeader>
            <CardTitle>Checkout cancelled</CardTitle>
            <CardDescription>You can restart the subscription whenever you’re ready.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="btn-primary" onClick={() => navigate("/")} data-testid="sub-cancel-back">Back to pricing</Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function PublicManagerProfile({ user, ensureAuth }) {
  const { id } = useParams();
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openReq, setOpenReq] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/managers/${id}`);
        if (!cancelled) setManager(res.data);
      } catch {/* 404 */}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Open Graph + SEO meta tags
  useEffect(() => {
    if (!manager) return;
    const title = `${manager.name} — ${manager.title} · Interimio`;
    document.title = title;
    const ensure = (selector, attrs) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement(selector.startsWith("meta") ? "meta" : "link");
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        document.head.appendChild(el);
      } else {
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      }
    };
    ensure(`meta[property='og:title']`, { property: "og:title", content: title });
    ensure(`meta[property='og:description']`, { property: "og:description", content: manager.bio || `${manager.title} based in ${manager.location} — daily rate €${manager.daily_rate_eur}.` });
    ensure(`meta[property='og:image']`, { property: "og:image", content: manager.image_url || "" });
    ensure(`meta[name='twitter:card']`, { name: "twitter:card", content: "summary_large_image" });
    return () => { document.title = "Interimio"; };
  }, [manager]);

  if (loading) return <div className="p-8" data-testid="public-profile-loading">Loading…</div>;
  if (!manager) return (
    <div className="section" data-testid="public-profile-notfound">
      <div className="mx-auto max-w-3xl px-6">
        <Card><CardHeader><CardTitle>Manager not found</CardTitle><CardDescription>This profile may have been removed.</CardDescription></CardHeader></Card>
      </div>
    </div>
  );

  const shareUrl = window.location.href;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const twUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${manager.name} on Interimio`)}&url=${encodeURIComponent(shareUrl)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Link copied"); }
    catch { toast.error("Copy failed"); }
  };

  const isMember = !!user;
  const isApprovedClient = user && user.role === "client" && user.client_approved;
  const isOwnerOrAdmin = user && (user.role === "admin" || (user.id && manager.user_id === user.id));

  return (
    <section className="section" data-testid="public-profile">
      <div className="mx-auto max-w-5xl px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-6">
              <img src={manager.image_url || "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40"} alt={manager.name} className="w-full md:w-64 h-64 object-cover rounded-lg" />
              <div className="flex-1">
                <CardTitle className="text-3xl" data-testid="profile-name">{manager.name}</CardTitle>
                <CardDescription className="text-lg">{manager.title} · {manager.location}</CardDescription>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(manager.skills || []).slice(0, isMember ? 99 : 5).map((s, i) => (<Badge key={i} className="badge-skill">{s}</Badge>))}
                </div>
                {isMember ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 max-w-md">
                    <div className="rounded-md border p-3">
                      <div className="text-xs opacity-70">Tagessatz</div>
                      <div className="text-2xl font-bold" data-testid="profile-rate">€{manager.daily_rate_eur}</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-md border-2 border-dashed border-blue-200 bg-blue-50 p-4 max-w-md" data-testid="profile-locked-rate">
                    <div className="text-sm font-semibold text-blue-900">Tagessatz & Vollprofil nur für Mitglieder</div>
                    <div className="text-xs opacity-80 mt-1">Registrieren Sie sich als Unternehmen, um Tagessatz, Bio, Verfügbarkeit und Kontaktoption freizuschalten.</div>
                    <Button
                      className="btn-primary mt-3"
                      onClick={() => ensureAuth()}
                      data-testid="profile-unlock-btn"
                    >Jetzt registrieren / einloggen</Button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {isMember && manager.bio && (
              <div>
                <h3 className="text-sm uppercase opacity-60 tracking-wider">Über</h3>
                <p className="mt-2 text-base" data-testid="profile-bio">{manager.bio}</p>
              </div>
            )}
            {isMember && (
              <div>
                <h3 className="text-sm uppercase opacity-60 tracking-wider mb-2">Verfügbarkeit (nächste 12 Wochen)</h3>
                <AvailabilityCalendar managerId={manager.id} editable={isOwnerOrAdmin} />
              </div>
            )}
            {isMember && (
              <div className="flex flex-wrap gap-2">
                {isApprovedClient && (
                  <Button
                    className="btn-primary"
                    data-testid="profile-request-btn"
                    onClick={() => setOpenReq(true)}
                  >Manager anfragen</Button>
                )}
                {/* Social share + PDF only inside member area */}
                <a href={liUrl} target="_blank" rel="noopener noreferrer" data-testid="profile-share-li"><Button variant="outline">Auf LinkedIn teilen</Button></a>
                <a href={twUrl} target="_blank" rel="noopener noreferrer" data-testid="profile-share-tw"><Button variant="outline">Auf X teilen</Button></a>
                <Button variant="outline" onClick={copy} data-testid="profile-share-copy">Link kopieren</Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await axios.get(`${API}/managers/${manager.id}/pdf`, { headers: authHeaders(), responseType: "blob" });
                      const url = URL.createObjectURL(res.data);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `Interimio_${(manager.name || "manager").replace(/\W+/g, "_")}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      toast.error("PDF konnte nicht geladen werden");
                    }
                  }}
                  data-testid="profile-download-pdf"
                >PDF herunterladen</Button>
              </div>
            )}
            <Dialog open={openReq} onOpenChange={setOpenReq}>
              <RequestDialog manager={manager} onRequest={() => setOpenReq(false)} />
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MembersOnlyDirectoryCard({ openRegister, user, ensureAuth }) {
  return (
    <div id="browse" className="rounded-xl border-2 border-dashed border-blue-200 bg-gradient-to-br from-blue-50 to-white p-8 text-center" data-testid="directory-locked">
      <div className="text-4xl mb-3">🔒</div>
      <h3 className="text-xl font-semibold">Manager-Verzeichnis für Mitglieder</h3>
      <p className="mt-2 text-sm opacity-80 max-w-md mx-auto">
        Aus Datenschutz- und Qualitätsgründen zeigen wir unsere Interim Manager nur eingeloggten und verifizierten Unternehmen.
        Kostenlos in 60 Sekunden registrieren – wir schalten Sie manuell frei.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        <Button className="btn-primary" onClick={() => (user ? ensureAuth() : openRegister())} data-testid="directory-locked-register">
          {user ? "E-Mail bestätigen" : "Als Unternehmen registrieren"}
        </Button>
        <a href="#ai-matching-section"><Button variant="outline">Mandat einstellen</Button></a>
      </div>
    </div>
  );
}

function HomeView({ user, ensureAuth, ensureManagerAuth, ensureAnyVerified, ensureLoginOnly, refreshUser, openRegister }) {
  return (
    <>
      <Hero user={user} ensureLoginOnly={ensureLoginOnly} openRegister={openRegister} />
      <MarketBarometer />
      <ValueProps openRegister={openRegister} />
      <QualitySection />
      <HowItWorksSection />
      <CategoriesSection />
      <PendingApprovalNotice user={user} />
      {user && user.email_verified && <ManagerOfMonth />}
      <section className="section" id="ai-matching-section" data-testid="ai-matching-section">
        <div className="mx-auto max-w-7xl px-6">
          <AIMatchingFlow user={user} ensureAuth={ensureAuth} />
        </div>
      </section>
      <div className="section">
        <div className="mx-auto max-w-7xl px-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {user && user.email_verified ? (
              <Directory ensureAuth={ensureAuth} user={user} />
            ) : (
              <MembersOnlyDirectoryCard openRegister={openRegister} user={user} ensureAuth={ensureAuth} />
            )}
          </div>
          <div className="lg:col-span-1">
            <ManagerPricing ensureManagerAuth={ensureManagerAuth} user={user} refreshUser={refreshUser} openRegister={openRegister} />
            <MyReferralCard user={user} />
            <ProfileCheckCard user={user} />
          </div>
        </div>
      </div>
      <LearningSection user={user} ensureAnyVerified={ensureAnyVerified} ensureLoginOnly={ensureLoginOnly} />
      <PodcastSection user={user} ensureLoginOnly={ensureLoginOnly} />
    </>
  );
}

function AppShell() {
  const { user, login, logout, refreshUser } = useAuth();
  const [openLogin, setOpenLogin] = useState(false);
  const [openRegister, setOpenRegister] = useState(false);
  const [openOnboarding, setOpenOnboarding] = useState(false);

  // Auto-open onboarding wizard for newly-paid managers
  useEffect(() => {
    if (user && user.role === "manager" && user.subscription_active && !user.onboarding_completed) {
      setOpenOnboarding(true);
    }
  }, [user?.id, user?.subscription_active, user?.onboarding_completed]);

  // Manual open via event from elsewhere in app
  useEffect(() => {
    const h = () => setOpenOnboarding(true);
    window.addEventListener("open-onboarding", h);
    return () => window.removeEventListener("open-onboarding", h);
  }, []);

  const ensureAuth = () => {
    if (!user) { setOpenLogin(true); toast.info("Please login to continue"); return false; }
    if (!user.email_verified) { toast.info("Please verify your email to contact a manager"); return false; }
    if (user.role !== "client") { toast.info("Use a client account to contact managers"); return false; }
    if (!user.client_approved) { toast.error("Your company account is pending review. Our team will contact you shortly."); return false; }
    return true;
  };
  const ensureManagerAuth = () => {
    if (!user) { setOpenLogin(true); return false; }
    if (user.role !== "manager") { toast.info("Switch to a manager account"); return false; }
    if (!user.email_verified) { toast.info("Verify your email to subscribe"); return false; }
    return true;
  };
  const ensureAnyVerified = () => {
    if (!user) { setOpenLogin(true); return false; }
    if (!user.email_verified) { toast.info("Verify your email to enroll"); return false; }
    return true;
  };
  const ensureLoginOnly = () => { if (!user) { setOpenLogin(true); return false; } return true; };

  return (
    <div className="App">
      <Header user={user} logout={logout} openLogin={() => setOpenLogin(true)} openRegister={() => setOpenRegister(true)} />
      <Routes>
        <Route
          path="/"
          element={<HomeView user={user} ensureAuth={ensureAuth} ensureManagerAuth={ensureManagerAuth} ensureAnyVerified={ensureAnyVerified} ensureLoginOnly={ensureLoginOnly} refreshUser={refreshUser} openRegister={() => setOpenRegister(true)} />}
        />
        <Route path="/admin" element={<AdminPage user={user} />} />
        <Route path="/dashboard" element={<ManagerDashboard user={user} />} />
        <Route path="/m/:id" element={<PublicManagerProfile user={user} ensureAuth={ensureAuth} />} />
        <Route path="/subscription/success" element={<SubscriptionSuccess refreshUser={refreshUser} />} />
        <Route path="/subscription/cancel" element={<SubscriptionCancel />} />
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route path="/agb" element={<AGB />} />
      </Routes>
      <Footer />
      <Chatbot />

      <Dialog open={openLogin} onOpenChange={setOpenLogin}>
        <LoginDialog onDone={() => setOpenLogin(false)} doLogin={login} />
      </Dialog>
      <Dialog open={openRegister} onOpenChange={setOpenRegister}>
        <RegisterDialog onDone={() => { setOpenRegister(false); setOpenLogin(true); }} />
      </Dialog>
      <Dialog open={openOnboarding} onOpenChange={setOpenOnboarding}>
        {user && <OnboardingWizard user={user} refreshUser={refreshUser} onClose={() => setOpenOnboarding(false)} />}
      </Dialog>
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <SettingsProvider>
        <BrowserRouter>
          <AppShell />
          <Toaster richColors position="top-center" />
        </BrowserRouter>
      </SettingsProvider>
    </I18nProvider>
  );
}

export default App;
