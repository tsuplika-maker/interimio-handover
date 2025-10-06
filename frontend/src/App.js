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
import { Calendar } from "./components/ui/calendar.jsx";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./components/ui/input-otp.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.jsx";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function useAuth() {
  const [user, setUser] = useState(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const me = async () => {
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

  return { user, setUser, token, login, logout };
}

function Header({ openLogin, openRegister, user, logout }) {
  return (
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur border-b">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <div className="font-bold text-xl">Interimio</div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm opacity-80">{user.email} • {user.role} {user.email_verified ? "✓" : "(verify)"}</span>
              <button className="btn-primary" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={openLogin}>Login</button>
              <button className="btn-primary" onClick={openRegister}>Register</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ ensureLoginOnly }) {
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
            <button className="btn-primary" style={{background:"#0a5db0"}} onClick={ensureLoginOnly}>Member area</button>
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

function ManagerCard({ m, onRequest, ensureAuth }) {
  const [open, setOpen] = useState(false);
  const onClickRequest = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ensureAuth()) return;
    setOpen(true);
  };
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
          <Button className="btn-primary" onClick={onClickRequest}>Request</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <RequestDialog manager={m} onRequest={() => { setOpen(false); onRequest && onRequest(); }} />
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
      const token = localStorage.getItem("access_token");
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
      const res = await axios.post(`${API}/leads`, payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`Request sent. Estimated service fee: €${res.data.fee_eur}`);
      onRequest && onRequest();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Could not send request");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Request {manager.name}</DialogTitle>
        <DialogDescription>Clients must be logged in and verified (email) to contact a manager. Service fee is 20% per day.</DialogDescription>
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

function ManagerPricing({ ensureManagerAuth }) {
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
        <CardDescription>Join Interimio for €299/month. Add your profile and get discovered. You need an account and email verification to create your profile.</CardDescription>
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
              <Button className="btn-primary" onClick={ensureManagerAuth}>Create your profile</Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

function Directory({ ensureAuth }) {
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
      const res = await axios.get(`${API}/managers?${params.toString()}`);
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
    <section id="browse" className="section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Browse interim managers</h2>
            <p className="text-sm text-muted-foreground">Search by title, skills, location, and rate.</p>
          </div>
          <button className="btn-primary" onClick={async () => { await axios.post(`${API}/managers/seed`); toast.success("Sample profiles added"); fetchManagers(); }}>Add sample profiles</button>
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
              <ManagerCard key={m.id} m={m} onRequest={requestRefresh} ensureAuth={ensureAuth} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function RegisterDialog({ onDone }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("client");
  const [step, setStep] = useState("form");
  const [otp, setOtp] = useState("");
  const [userId, setUserId] = useState(null);

  const submit = async () => {
    try {
      const res = await axios.post(`${API}/auth/register`, { email, phone, password, role });
      setUserId(res.data.user_id);
      setStep("verify");
      toast.success("Registered. Check your email for the code");
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
      await axios.post(`${API}/auth/verify-otp`, { user_id: userId, method: "email", code: otp });
      toast.success("Email verified. You can log in now.");
      onDone && onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invalid code");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Create account</DialogTitle>
        <DialogDescription>Select your role and verify by email to proceed.</DialogDescription>
      </DialogHeader>
      {step === "form" ? (
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+49..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <select className="w-full border rounded-md h-10 px-2" value={role} onChange={e => setRole(e.target.value)}>
                <option value="client">Client</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button className="btn-primary" onClick={submit}>Register</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 py-2">
          <div>
            <Label>Enter the 6-digit code (emailed)</Label>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  {[0,1,2,3,4,5].map(i => (<InputOTPSlot key={i} index={i} />))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button className="btn-primary" onClick={verify}>Verify</Button>
            <Button className="btn-primary" onClick={resend}>Resend</Button>
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
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Login</DialogTitle>
        <DialogDescription>Access your Interimio account</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div>
          <Label>Email</Label>
          <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="flex justify-end pt-2">
          <Button className="btn-primary" onClick={submit}>Login</Button>
        </div>
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
      const res = await axios.get(`${API}/courses?${params.toString()}`, { headers: user ? { Authorization: `Bearer ${localStorage.getItem("access_token")}` } : {} });
      setCourses(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => { if (user) load(); }, [user, level, topic]);

  const seed = async () => {
    await axios.post(`${API}/courses/seed`);
    await load();
  };

  if (!user) {
    return (
      <section id="learn" className="section">
        <div className="mx-auto max-w-7xl px-6">
          <Card>
            <CardHeader>
              <CardTitle>Learning platform</CardTitle>
              <CardDescription>Login to access courses and lessons</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="btn-primary" onClick={ensureLoginOnly}>Login to access</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section id="learn" className="section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Learning platform</h2>
            <p className="text-sm text-muted-foreground">Courses, lessons, and progress tracking</p>
          </div>
          <button className="btn-primary" onClick={seed}>Add sample courses</button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Topic</Label>
            <Input placeholder="e.g. Leadership" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <Label>Level</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
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
            <Card key={c.id} className="card-hover">
              <CardHeader>
                <CardTitle>{c.title}</CardTitle>
                <CardDescription>{c.level} • {(c.tags || []).join(", ")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm opacity-80">{c.description}</p>
                <div className="mt-4 flex justify-end">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="btn-primary" onClick={() => setSelected(c.id)}>Open</Button>
                    </DialogTrigger>
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
    const token = localStorage.getItem("access_token");
    const res = await axios.get(`${API}/courses/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    setCourse(res.data.course);
    setLessons(res.data.lessons || []);
  };
  useEffect(() => { load(courseId); }, [courseId]);

  const enroll = async () => {
    if (!ensureAnyVerified()) return;
    const token = localStorage.getItem("access_token");
    const res = await axios.post(`${API}/enrollments`, { course_id: courseId }, { headers: { Authorization: `Bearer ${token}` } });
    setEnrolled(true);
    setProgress(res.data.progress_percent || 0);
    toast.success("Enrolled");
  };

  const toggleComplete = async (lessonId, completed) => {
    const token = localStorage.getItem("access_token");
    const res = await axios.post(`${API}/enrollments/progress`, { course_id: courseId, lesson_id: lessonId, completed }, { headers: { Authorization: `Bearer ${token}` } });
    setProgress(res.data.progress_percent);
  };

  if (!course) return <DialogContent className="sm:max-w-2xl">Loading…</DialogContent>;

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{course.title}</DialogTitle>
        <DialogDescription>{course.description}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm opacity-70">Progress: {progress}%</div>
        {!enrolled && (
          <div className="flex justify-end"><Button className="btn-primary" onClick={enroll}>Enroll</Button></div>
        )}
        <div className="space-y-2">
          {lessons.map((l, idx) => (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle className="text-base">{idx + 1}. {l.title}</CardTitle>
                <CardDescription>{l.duration_minutes || 5} min</CardDescription>
              </CardHeader>
              <CardContent>
                {l.video_url ? (
                  <div className="aspect-video w-full overflow-hidden rounded-md">
                    <iframe title={l.title} src={l.video_url} width="100%" height="100%" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen></iframe>
                  </div>
                ) : null}
                {l.content ? (<p className="mt-3 text-sm opacity-80">{l.content}</p>) : null}
                <div className="mt-3 flex justify-end gap-2">
                  <Button className="btn-primary" onClick={() => toggleComplete(l.id, true)}>Mark completed</Button>
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
      const token = localStorage.getItem("access_token");
      await axios.post(`${API}/podcasts`, { title, description: desc, podigee_iframe_url: url }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Episode added");
      onAdded && onAdded();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add episode (manager only)");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Add episode</DialogTitle>
        <DialogDescription>Paste Podigee iframe URL (ends with /embed)</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
        <div>
          <Label>Podigee iframe URL</Label>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yourpodcast.podigee.io/1-episode/embed" />
        </div>
        <div className="flex justify-end"><Button className="btn-primary" onClick={submit}>Save</Button></div>
      </div>
    </DialogContent>
  );
}

function PodcastSection({ user, ensureLoginOnly }) {
  const [eps, setEps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [openAdd, setOpenAdd] = useState(false);

  const load = async () => {
    try {
      const headers = user ? { Authorization: `Bearer ${localStorage.getItem("access_token")}` } : {};
      const res = await axios.get(`${API}/podcasts`, { headers });
      setEps(res.data || []);
      if (!selected && res.data && res.data.length) setSelected(res.data[0]);
    } catch (e) {
      // not logged in or error
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const seed = async () => { await axios.post(`${API}/podcasts/seed`); await load(); };

  if (!user) {
    return (
      <section id="podcast" className="section">
        <div className="mx-auto max-w-7xl px-6">
          <Card>
            <CardHeader>
              <CardTitle>Interimio Podcast</CardTitle>
              <CardDescription>Login to access the member-only podcast area</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="btn-primary" onClick={ensureLoginOnly}>Login to access</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section id="podcast" className="section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Interimio Podcast</h2>
            <p className="text-sm text-muted-foreground">Member area — Podigee player</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={seed}>Add sample episodes</button>
            <Dialog open={openAdd} onOpenChange={setOpenAdd}>
              <DialogTrigger asChild>
                <Button className="btn-primary">Add episode</Button>
              </DialogTrigger>
              <PodcastAddDialog onAdded={() => { setOpenAdd(false); load(); }} />
            </Dialog>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {selected ? (
              <div className="aspect-video w-full overflow-hidden rounded-md">
                <iframe title={selected.title} src={selected.podigee_iframe_url} width="100%" height="100%" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
              </div>
            ) : (
              <div className="text-sm opacity-70">No episode selected</div>
            )}
          </div>
          <div className="space-y-3">
            {eps.map(ep => (
              <Card key={ep.id} className="cursor-pointer hover:shadow" onClick={() => setSelected(ep)}>
                <CardHeader>
                  <CardTitle className="text-base">{ep.title}</CardTitle>
                  <CardDescription>{new Date(ep.publish_date || ep.created_at).toDateString()}</CardDescription>
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
  const { user, login, logout } = useAuth();
  const [openLogin, setOpenLogin] = useState(false);
  const [openRegister, setOpenRegister] = useState(false);

  const ensureAuth = () => {
    if (!user) {
      setOpenLogin(true);
      toast.info("Please login to continue");
      return false;
    }
    if (!user.email_verified) {
      toast.info("Please verify your email to contact a manager");
      return false;
    }
    if (user.role !== "client") {
      toast.info("Use a client account to contact managers");
      return false;
    }
    return true;
  };

  const ensureManagerAuth = () => {
    if (!user) { setOpenLogin(true); return false; }
    if (user.role !== "manager") { toast.info("Switch to a manager account"); return false; }
    if (!user.email_verified) { toast.info("Verify your email to create a profile"); return false; }
    return true;
  };

  const ensureAnyVerified = () => {
    if (!user) { setOpenLogin(true); return false; }
    if (!user.email_verified) { toast.info("Verify your email to enroll"); return false; }
    return true;
  };

  const ensureLoginOnly = () => {
    if (!user) { setOpenLogin(true); return false; }
    return true;
  };

  return (
    <div className="App">
      <BrowserRouter>
        <Header user={user} logout={logout} openLogin={() => setOpenLogin(true)} openRegister={() => setOpenRegister(true)} />
        <Hero ensureLoginOnly={ensureLoginOnly} />
        <div className="section">
          <div className="mx-auto max-w-7xl px-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2"><Directory ensureAuth={ensureAuth} /></div>
            <div className="lg:col-span-1"><ManagerPricing ensureManagerAuth={ensureManagerAuth} /></div>
          </div>
        </div>
        <LearningSection user={user} ensureAnyVerified={ensureAnyVerified} ensureLoginOnly={ensureLoginOnly} />
        <PodcastSection user={user} ensureLoginOnly={ensureLoginOnly} />
        <Footer />

        <Dialog open={openLogin} onOpenChange={setOpenLogin}>
          <LoginDialog onDone={() => setOpenLogin(false)} doLogin={login} />
        </Dialog>
        <Dialog open={openRegister} onOpenChange={setOpenRegister}>
          <RegisterDialog onDone={() => { setOpenRegister(false); setOpenLogin(true); }} />
        </Dialog>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </div>
  );
}

export default App;