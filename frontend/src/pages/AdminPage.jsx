import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button.jsx";
import { Card, CardContent, CardDescription, CardHeader } from "../components/ui/card.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.jsx";
import { AdminLeads } from "../components/admin/AdminLeads.jsx";
import { AdminDiscountCodes } from "../components/admin/AdminDiscountCodes.jsx";
import { useAuthCtx } from "../context/AuthContext.jsx";
import { api } from "../lib/api";

function Stat({ label, value, testId }) {
  return (
    <Card className="border-0 shadow-sm bg-white">
      <CardHeader className="pb-1"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent><div className="text-2xl font-bold" data-testid={testId}>{value ?? "…"}</div></CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { user, openLogin } = useAuthCtx();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.role === "admin") api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  }, [user]);

  if (!user) return <div className="mx-auto max-w-3xl px-6 py-20 text-center" data-testid="admin-login-required"><p>Admin login required.</p><Button className="btn-primary mt-4" onClick={openLogin}>Login</Button></div>;
  if (user.role !== "admin") return <div className="mx-auto max-w-3xl px-6 py-20 text-center" data-testid="admin-forbidden">You don't have access to the admin area. <Link className="underline" to="/">Back home</Link></div>;

  return (
    <div className="bg-[#f6f9fd] min-h-screen" data-testid="admin-page">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-1 text-sm opacity-70">Leads, discount codes and platform health</p>

        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
          <Stat label="Open leads" value={stats?.leads_new} testId="admin-stat-leads-new" />
          <Stat label="Total service fees" value={stats ? `€${Number(stats.fees_total_eur).toLocaleString("de-DE")}` : null} testId="admin-stat-fees" />
          <Stat label="Manager profiles" value={stats?.manager_profiles} testId="admin-stat-managers" />
          <Stat label="Pro waitlist" value={stats?.pro_interest} testId="admin-stat-pro" />
        </div>

        <Tabs defaultValue="leads" className="mt-8">
          <TabsList data-testid="admin-tabs">
            <TabsTrigger value="leads" data-testid="admin-tab-leads">Lead inbox</TabsTrigger>
            <TabsTrigger value="codes" data-testid="admin-tab-codes">Discount codes</TabsTrigger>
          </TabsList>
          <TabsContent value="leads" className="mt-4"><AdminLeads /></TabsContent>
          <TabsContent value="codes" className="mt-4"><AdminDiscountCodes /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
