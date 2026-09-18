import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.jsx";
import { Input } from "../components/ui/input.jsx";
import { Label } from "../components/ui/label.jsx";
import { Textarea } from "../components/ui/textarea.jsx";
import { useAuthCtx } from "../context/AuthContext.jsx";
import { api, errMsg, splitList } from "../lib/api";

const EMPTY = { name: "", title: "", location: "", daily_rate_eur: "", bio: "", about: "", skills: "", industries: "", languages: "", years_experience: "", linkedin_url: "", image_url: "", highlights: "", availability_start: "" };

function Field({ label, k, form, set, type = "text", placeholder, textarea }) {
  const Comp = textarea ? Textarea : Input;
  return (
    <div>
      <Label>{label}</Label>
      <Comp data-testid={`profile-${k}-input`} type={type} placeholder={placeholder} value={form[k]} onChange={(e) => set({ ...form, [k]: e.target.value })} />
    </div>
  );
}

export default function ManagerProfilePage() {
  const { user, openLogin } = useAuthCtx();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [profileId, setProfileId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "manager") return;
    api.get("/managers/me").then((r) => {
      const m = r.data;
      if (!m) return;
      setProfileId(m.id);
      setForm({
        name: m.name || "", title: m.title || "", location: m.location || "", daily_rate_eur: m.daily_rate_eur ?? "",
        bio: m.bio || "", about: m.about || "", skills: (m.skills || []).join(", "), industries: (m.industries || []).join(", "),
        languages: (m.languages || []).join(", "), years_experience: m.years_experience ?? "", linkedin_url: m.linkedin_url || "",
        image_url: m.image_url || "", highlights: (m.highlights || []).join("\n"), availability_start: m.availability_start || "",
      });
    }).catch(() => {});
  }, [user]);

  if (!user) return <div className="mx-auto max-w-3xl px-6 py-20 text-center" data-testid="profile-login-required"><p>Please log in with a manager account.</p><Button className="btn-primary mt-4" onClick={openLogin}>Login</Button></div>;
  if (user.role !== "manager") return <div className="mx-auto max-w-3xl px-6 py-20 text-center" data-testid="profile-manager-only">This page is for interim managers. <Link className="underline" to="/">Back home</Link></div>;

  const save = async () => {
    if (!user.email_verified) { toast.info("Verify your email to publish your profile"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, title: form.title, location: form.location,
        daily_rate_eur: Number(form.daily_rate_eur) || 0,
        bio: form.bio || null, about: form.about || null,
        skills: splitList(form.skills), industries: splitList(form.industries), languages: splitList(form.languages),
        years_experience: form.years_experience === "" ? null : Number(form.years_experience),
        linkedin_url: form.linkedin_url || null, image_url: form.image_url || null,
        highlights: splitList(form.highlights), availability_start: form.availability_start || null,
      };
      const res = await api.post("/managers", payload);
      setProfileId(res.data.id);
      toast.success(profileId ? "Profile updated" : "Profile published — you're live in the directory");
      navigate(`/managers/${res.data.id}`);
    } catch (e) {
      toast.error(errMsg(e, "Could not save profile"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12" data-testid="manager-profile-page">
      <h1 className="text-3xl font-bold">{profileId ? "Edit your profile" : "Create your profile"}</h1>
      <p className="mt-2 text-sm opacity-70">Listing on Interimio is free for interim managers. Clients see your public profile and can request you directly.</p>
      {!user.email_verified && <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="profile-verify-warning">Please verify your email before publishing your profile.</div>}

      <Card className="mt-8">
        <CardHeader><CardTitle>Basics</CardTitle><CardDescription>What clients see first</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" k="name" form={form} set={setForm} placeholder="Anna Richter" />
          <Field label="Title" k="title" form={form} set={setForm} placeholder="Interim CFO" />
          <Field label="Location" k="location" form={form} set={setForm} placeholder="Berlin, DE" />
          <Field label="Daily rate (€)" k="daily_rate_eur" form={form} set={setForm} type="number" placeholder="1200" />
          <Field label="Years of experience" k="years_experience" form={form} set={setForm} type="number" placeholder="15" />
          <Field label="Available from" k="availability_start" form={form} set={setForm} type="date" />
          <Field label="Photo URL" k="image_url" form={form} set={setForm} placeholder="https://…" />
          <Field label="LinkedIn URL" k="linkedin_url" form={form} set={setForm} placeholder="https://linkedin.com/in/…" />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Expertise</CardTitle><CardDescription>Comma-separated lists</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Skills" k="skills" form={form} set={setForm} placeholder="Turnaround, FP&A, M&A" />
          <Field label="Industries" k="industries" form={form} set={setForm} placeholder="Manufacturing, Automotive" />
          <Field label="Languages" k="languages" form={form} set={setForm} placeholder="German, English" />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Story</CardTitle><CardDescription>Short teaser for the directory card and a longer profile text</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <Field label="One-line summary" k="bio" form={form} set={setForm} placeholder="Finance leader with 15+ years in turnaround…" />
          <Field label="About you" k="about" form={form} set={setForm} textarea placeholder="Where you create the most impact, how you work, what clients can expect." />
          <Field label="Track record (one per line)" k="highlights" form={form} set={setForm} textarea placeholder={"Led €120M turnaround\nPost-merger integration of 3 entities"} />
        </CardContent>
      </Card>

      <div className="mt-8 flex justify-end gap-3">
        {profileId && <Link to={`/managers/${profileId}`}><Button variant="outline" data-testid="profile-view-public-btn">View public profile</Button></Link>}
        <Button className="btn-primary" data-testid="profile-save-btn" disabled={saving} onClick={save}>{saving ? "Saving…" : profileId ? "Save changes" : "Publish profile"}</Button>
      </div>
    </div>
  );
}
