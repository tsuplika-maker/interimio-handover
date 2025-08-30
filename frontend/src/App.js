import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { BrowserRouter } from "react-router-dom";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.jsx";
import { Calendar } from "./components/ui/calendar.jsx";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const CURRENCY = "EUR";

function useManagers(searchParams) {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchParams.q) params.append("q", searchParams.q);
      if (searchParams.location) params.append("location", searchParams.location);
      if (searchParams.minRate) params.append("min_rate", searchParams.minRate);
      if (searchParams.maxRate) params.append("max_rate", searchParams.maxRate);
      const res = await axios.get(`${API}/managers?${params.toString()}`);
      setManagers(res.data || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load managers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchManagers(); }, [searchParams.q, searchParams.location, searchParams.minRate, searchParams.maxRate]);

  return { managers, loading, refresh: fetchManagers };
}

function Hero() {
  const heroUrl = "https://images.unsplash.com/39/lIZrwvbeRuuzqOoWJUEn_Photoaday_CSD%20(1%20of%201)-5.jpg";
  return (
    <section className="relative hero-bg" style={{ backgroundImage: `url(${heroUrl})` }}>
      <div className="hero-overlay" />
      <div className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-2xl text-white">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">Interimio — Find trusted interim managers fast</h1>
          <p className="mt-4 text-lg opacity-90">Browse vetted leaders, filter by skills and rates, and submit a request. Clients pay a 20% service fee per day of engagement.</p>
          <div className="mt-6 flex gap-3">
            <a href="#browse"><button className="btn-primary">Browse managers</button></a>
            <a href="#for-managers"><button className="btn-primary" style={{background:"#0a5db0"}}>For managers</button></a>
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchBar({ onChange, values }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <div>
        <Label>Search</Label>
        <Input placeholder="Name, title, skill" value={values.q} onChange={(e) => onChange({ ...values, q: e.target.value })} />
      </div>
      <div>
        <Label>Location</Label>
        <Input placeholder="e.g. Berlin" value={values.location} onChange={(e) => onChange({ ...values, location: e.target.value })} />
      </div>
      <div>
        <Label>Min rate (€)</Label>
        <Input type="number" min={0} value={values.minRate} onChange={(e) => onChange({ ...values, minRate: e.target.value })} />
      </div>
      <div>
        <Label>Max rate (€)</Label>
        <Input type="number" min={0} value={values.maxRate} onChange={(e) => onChange({ ...values, maxRate: e.target.value })} />
      </div>
    </div>
  );
}

function ManagerCard({ m, onRequest }) {
  return (
    <Card className="card-hover">
      <CardHeader className="flex flex-row items-start gap-4">
        <img src={m.image_url || "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40"} alt={m.name} className="h-16 w-16 rounded-lg object-cover" />
        <div>
          <CardTitle className="text-lg">{m.name}</CardTitle>
          <CardDescription>{m.title} · {m.location}</CardDescription>
          <div className="mt-2 flex flex-wrap gap-1">
            {(m.skills || []).slice(0,5).map((s, i) => (
              <Badge key={i} className="badge-skill">{s}</Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-80">Daily rate</div>
          <div className="text-xl font-semibold">€{m.daily_rate_eur}</div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{m.bio}</p>
        <div className="mt-4 flex justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="btn-primary">Request</Button>
            </DialogTrigger>
            <RequestDialog manager={m} onRequest={onRequest} />
          </Dialog>
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
        start_date: startDate ? startDate.toISOString().slice(0,10) : undefined,
        days: Number(days),
        daily_rate_eur: dailyRate,
        message,
      };
      const res = await axios.post(`${API}/leads`, payload);
      toast.success(`Request sent. Estimated service fee: €${res.data.fee_eur}`);
      onRequest && onRequest();
    } catch (e) {
      console.error(e);
      toast.error("Could not send request");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Request {manager.name}</DialogTitle>
        <DialogDescription>Clients pay a 20% service fee per day. We will contact you shortly.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Your company" />
          </div>
          <div>
            <Label>Contact name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <Label>Days</Label>
            <Input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Start date</Label>
          <div className="rounded-md border p-2">
            <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="rounded-md" />
          </div>
        </div>
        <div>
          <Label>Message</Label>
          <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Tell us about your need" />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-md border p-3">
          <div className="text-sm">Estimated service fee (20%):</div>
          <div className="text-lg font-semibold">€{fee}</div>
        </div>
      </div>
      <DialogFooter>
        <Button className="btn-primary" onClick={submit}>Send request</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ManagerPricing() {
  const [code, setCode] = useState("");
  const [price, setPrice] = useState(299);
  const [applied, setApplied] = useState(null);
  const BASE = 299;

  const seed = async () => {
    try {
      await axios.post(`${API}/discount-codes/seed`);
      toast.success("Demo codes loaded: SHARE10, PARTNER50, VIP100");
    } catch (e) {
      console.error(e);
      toast.error("Could not load demo codes");
    }
  };

  const apply = async () => {
    const raw = (code || "").trim();
    if (!raw) return;
    const normalized = raw.toUpperCase();
    try {
      const res = await axios.get(`${API}/discount-codes/validate`, { params: { code: normalized } });
      if (res.data.valid) {
        const p = Number(res.data.final_price_eur);
        setPrice(isNaN(p) ? BASE : p);
        setApplied(res.data.applied || {});
        toast.success(`Code applied. New price €${res.data.final_price_eur}/month`);
      } else {
        setPrice(BASE);
        setApplied(null);
        toast.error("Invalid or inactive code");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not validate code");
    }
  };

  return (
    <Card id="for-managers" className="card-hover">
      <CardHeader>
        <CardTitle>For Interim Managers</CardTitle>
        <CardDescription>Join Interimio for €299/month. Add your profile and get discovered. You can apply discount codes shared with you.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Discount code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter code" />
          </div>
          <Button className="btn-primary" onClick={apply}>Apply</Button>
          <Button className="btn-primary" onClick={seed}>Load demo codes</Button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm">Your monthly price</div>
          <div className="text-2xl font-bold">€{price} <span className="text-sm font-normal opacity-70">/ month</span></div>
        </div>
        {applied ? (
          <div className="mt-2 text-sm text-green-700">Applied: {applied.percent_off ? `${applied.percent_off}%` : `€${applied.amount_off_eur}`}</div>
        ) : null}
        <div className="mt-5">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="btn-primary">Create your profile</Button>
            </DialogTrigger>
            <SignupDialog />
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

function SignupDialog() {
  const [form, setForm] = useState({ name: "", title: "", location: "", daily_rate_eur: 1000, bio: "", skills: "", image_url: "" });

  const submit = async () => {
    try {
      const payload = {
        ...form,
        daily_rate_eur: Number(form.daily_rate_eur),
        skills: form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      const res = await axios.post(`${API}/managers`, payload);
      toast.success("Profile created. You are now discoverable.");
    } catch (e) {
      console.error(e);
      toast.error("Could not create profile");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Create profile</DialogTitle>
        <DialogDescription>Basic details to appear in the directory.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Interim CFO" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="City, Country" />
          </div>
          <div>
            <Label>Daily rate (€)</Label>
            <Input type="number" value={form.daily_rate_eur} onChange={e => setForm({ ...form, daily_rate_eur: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Skills (comma separated)</Label>
          <Input value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} placeholder="M&amp;A, Turnaround, Cloud" />
        </div>
        <div>
          <Label>Short bio</Label>
          <Textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
        </div>
        <div>
          <Label>Image URL (optional)</Label>
          <Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
        </div>
      </div>
      <DialogFooter>
        <Button className="btn-primary" onClick={submit}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Directory() {
  const [filters, setFilters] = useState({ q: "", location: "", minRate: "", maxRate: "" });
  const { managers, loading, refresh } = useManagers(filters);

  const requestRefresh = () => refresh();

  return (
    <section id="browse" className="section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Browse interim managers</h2>
            <p className="text-sm text-muted-foreground">Search by title, skills, location, and rate.</p>
          </div>
          <button className="btn-primary" onClick={async () => { await axios.post(`${API}/managers/seed`); toast.success("Sample profiles added"); refresh(); }}>Add sample profiles</button>
        </div>
        <div className="mt-6">
          <SearchBar values={filters} onChange={setFilters} />
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            <div>Loading...</div>
          ) : managers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No managers found. Try broadening your search.</div>
          ) : (
            managers.map(m => (
              <ManagerCard key={m.id} m={m} onRequest={requestRefresh} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto max-w-7xl px-6 py-8 flex items-center justify-between">
        <div className="text-sm">© {new Date().getFullYear()} Interimio</div>
        <div className="text-sm opacity-70">Pricing in EUR. Client fee: 20% per day.</div>
      </div>
    </footer>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Hero />
        <div className="section">
          <div className="mx-auto max-w-7xl px-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2"><Directory /></div>
            <div className="lg:col-span-1"><ManagerPricing /></div>
          </div>
        </div>
        <Footer />
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </div>
  );
}

export default App;