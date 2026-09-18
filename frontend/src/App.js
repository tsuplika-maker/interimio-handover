import { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast, Toaster } from "sonner";
import { Sparkles, CheckCircle2, Shield } from "lucide-react";

// shadcn components
import { Button } from "./components/ui/button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.jsx";
import { Input } from "./components/ui/input.jsx";
import { Label } from "./components/ui/label.jsx";
import { Badge } from "./components/ui/badge.jsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog.jsx";
import { Textarea } from "./components/ui/textarea.jsx";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./components/ui/input-otp.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.jsx";
import { RequestDialog } from "./components/RequestDialog.jsx";
import { AuthContext } from "./context/AuthContext.jsx";
import ManagerDetailPage from "./pages/ManagerDetailPage.jsx";
import ManagerProfilePage from "./pages/ManagerProfilePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import { MessageSquare } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

  return { user, setUser, login, logout };
}

function UnreadBadge({ user }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) { setN(0); return; }
    const load = () => axios.get(`${API}/conversations/unread-count`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }).then((r) => setN(r.data.unread || 0)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [user]);
  if (!user) return null;
  return (
    <Link to="/messages" className="relative inline-flex items-center gap-1 text-sm hover:text-[var(--brand-blue)]" data-testid="nav-messages">
      <MessageSquare className="h-4 w-4" /> Messages
      {n > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-blue)] px-1.5 text-[11px] font-semibold text-white" data-testid="nav-messages-unread">{n}</span>}
    </Link>
  );
}

function Header({ openLogin, openRegister, user, logout }) {
  return (
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur border-b">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-xl" data-testid="header-logo">Interimio</Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <a href="/#browse" className="hover:text-[var(--brand-blue)]" data-testid="nav-managers">Managers</a>
            <a href="/#learn" className="hover:text-[var(--brand-blue)]" data-testid="nav-learning">Learning</a>
            <a href="/#podcast" className="hover:text-[var(--brand-blue)]" data-testid="nav-podcast">Podcast</a>
            {user?.role === "manager" && <Link to="/profile" className="hover:text-[var(--brand-blue)]" data-testid="nav-my-profile">My profile</Link>}
            {user?.role === "admin" && <Link to="/admin" className="inline-flex items-center gap-1 font-semibold text-[var(--brand-blue)]" data-testid="nav-admin"><Shield className="h-4 w-4" />Admin</Link>}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <UnreadBadge user={user} />
          {user ? (
            <>
              <span className="text-sm opacity-80 hidden sm:inline" data-testid="header-user">{user.email} • {user.role} {user.email_verified ? "✓" : "(verify)"}</span>
              <button className="btn-primary" data-testid="logout-btn" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <button className="btn-primary" data-testid="login-btn" onClick={openLogin}>Login</button>
              <button className="btn-primary" data-testid="register-btn" onClick={openRegister}>Register</button>
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
    <Card className="card-hover" data-testid={`manager-card-${m.id}`}>
      <CardHeader className="flex flex-row items-start gap-4">
        <Link to={`/managers/${m.id}`}>
          <img src={m.image_url || "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40"} alt={m.name} className="h-16 w-16 rounded-lg object-cover" />
        </Link>
        <div>
          <CardTitle className="text-lg"><Link to={`/managers/${m.id}`} className="hover:text-[var(--brand-blue)]" data-testid={`manager-card-name-${m.id}`}>{m.name}</Link></CardTitle>
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
        <div className="mt-4 flex justify-end gap-2">
          <Link to={`/managers/${m.id}`}><Button variant="outline" data-testid={`manager-card-view-${m.id}`}>View profile</Button></Link>
          <Button className="btn-primary" data-testid={`manager-card-request-${m.id}`} onClick={onClickRequest}>Request</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <RequestDialog manager={m} onRequest={() => { setOpen(false); onRequest && onRequest(); }} />
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

const PRO_BENEFITS = [
  "Full access to the learning platform & knowledge library",
  "Early access to new podcast episodes",
  "Market insights and rate benchmarks before everyone else",
  "Priority placement in the directory",
];

function ManagerJoinCard({ ensureManagerAuth, user }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState(false);

  const goProfile = () => { if (ensureManagerAuth()) navigate("/profile"); };

  const joinWaitlist = async () => {
    if (!ensureManagerAuth()) return;
    try {
      const token = localStorage.getItem("access_token");
      const res = await axios.post(`${API}/pro/interest`, { discount_code: code || null }, { headers: { Authorization: `Bearer ${token}` } });
      setJoined(true);
      if (code && !res.data.code_valid) toast.warning("You're on the list, but the code was invalid or inactive");
      else toast.success(code ? "You're on the Pro list — your code is saved" : "You're on the Pro list");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not register interest");
    }
  };

  return (
    <div className="space-y-5" id="for-managers">
      <Card className="card-hover border-[rgba(11,107,203,0.25)]" data-testid="manager-join-card">
        <CardHeader>
          <Badge className="w-fit bg-emerald-50 text-emerald-700 border border-emerald-200" data-testid="manager-free-badge">Free for managers</Badge>
          <CardTitle className="mt-2">For Interim Managers</CardTitle>
          <CardDescription>Create your profile and get discovered by clients — at no cost. You only need an account with verified email.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {["Public profile with full track record", "Direct client requests to your inbox", "No subscription, no listing fee"].map((t, i) => (
              <li key={i} className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600" />{t}</li>
            ))}
          </ul>
          <div className="mt-5">
            <Button className="btn-primary w-full" data-testid="create-profile-btn" onClick={goProfile}>
              {user?.role === "manager" ? "Manage my profile" : "Create your free profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="card-hover bg-[#06182b] text-white border-0" data-testid="manager-pro-card">
        <CardHeader>
          <div className="flex items-center gap-2 text-[#7cc4ff] text-xs font-semibold uppercase tracking-wider"><Sparkles className="h-4 w-4" /> Coming soon</div>
          <CardTitle className="mt-1 text-white">Interimio Pro</CardTitle>
          <CardDescription className="text-white/70">Optional upgrade for managers who want more than a listing.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-white/90">
            {PRO_BENEFITS.map((t, i) => (
              <li key={i} className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#7cc4ff]" />{t}</li>
            ))}
          </ul>
          {joined ? (
            <div className="mt-5 rounded-md bg-white/10 p-3 text-sm" data-testid="pro-waitlist-done">You're on the list. We'll let you know when Pro launches.</div>
          ) : (
            <div className="mt-5 grid gap-2">
              <Input data-testid="pro-code-input" className="bg-white/10 border-white/20 text-white placeholder:text-white/50" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Shareholder / partner code (optional)" />
              <Button className="btn-primary w-full" data-testid="pro-waitlist-btn" onClick={joinWaitlist}>Notify me about Pro</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Directory({ ensureAuth, isAdmin }) {
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
          <button className="btn-primary" onClick={async () => { await axios.post(`${API}/managers/seed`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }); toast.success("Sample profiles added"); fetchManagers(); }} hidden={!isAdmin} data-testid="seed-managers-btn">Add sample profiles</button>
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
        <div className="text-sm opacity-70" data-testid="footer-pricing">Free for interim managers · Client service fee: 20% of the engagement</div>
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

  const ctx = { user, openLogin: () => setOpenLogin(true), ensureAuth, ensureManagerAuth };

  const home = (
    <>
      <Hero ensureLoginOnly={ensureLoginOnly} />
      <div className="section">
        <div className="mx-auto max-w-7xl px-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><Directory ensureAuth={ensureAuth} isAdmin={user?.role === "admin"} /></div>
          <div className="lg:col-span-1"><ManagerJoinCard ensureManagerAuth={ensureManagerAuth} user={user} /></div>
        </div>
      </div>
      <LearningSection user={user} ensureAnyVerified={ensureAnyVerified} ensureLoginOnly={ensureLoginOnly} />
      <PodcastSection user={user} ensureLoginOnly={ensureLoginOnly} />
    </>
  );

  return (
    <div className="App">
      <BrowserRouter>
        <AuthContext.Provider value={ctx}>
          <Header user={user} logout={logout} openLogin={() => setOpenLogin(true)} openRegister={() => setOpenRegister(true)} />
          <Routes>
            <Route path="/" element={home} />
            <Route path="/managers/:id" element={<ManagerDetailPage />} />
            <Route path="/profile" element={<ManagerProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/messages" element={<MessagesPage />} />
          </Routes>
          <Footer />

          <Dialog open={openLogin} onOpenChange={setOpenLogin}>
            <LoginDialog onDone={() => setOpenLogin(false)} doLogin={login} />
          </Dialog>
          <Dialog open={openRegister} onOpenChange={setOpenRegister}>
            <RegisterDialog onDone={() => { setOpenRegister(false); setOpenLogin(true); }} />
          </Dialog>
        </AuthContext.Provider>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </div>
  );
}

export default App;