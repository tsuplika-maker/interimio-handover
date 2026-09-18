import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Download, RefreshCw, MessageSquare } from "lucide-react";
import { Button } from "../ui/button.jsx";
import { Input } from "../ui/input.jsx";
import { Badge } from "../ui/badge.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.jsx";
import { api, errMsg } from "../../lib/api";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];
const STATUS_STYLE = { new: "bg-blue-50 text-blue-700 border-blue-200", contacted: "bg-amber-50 text-amber-700 border-amber-200", qualified: "bg-violet-50 text-violet-700 border-violet-200", won: "bg-emerald-50 text-emerald-700 border-emerald-200", lost: "bg-slate-100 text-slate-600 border-slate-200" };

export function AdminLeads() {
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/leads", { params: { status, q: q || undefined } });
      setLeads(res.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Could not load leads"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]);

  const updateStatus = async (id, s) => {
    try {
      await api.patch(`/admin/leads/${id}`, { status: s });
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: s } : l)));
      toast.success(`Lead marked as ${s}`);
    } catch (e) {
      toast.error(errMsg(e, "Could not update lead"));
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get("/admin/leads/export", { params: { status }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `interimio-leads-${status}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch (e) {
      toast.error(errMsg(e, "Export failed"));
    }
  };

  return (
    <div data-testid="admin-leads">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <Input data-testid="admin-leads-search" placeholder="Search company, contact, email, manager" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full md:w-44" data-testid="admin-leads-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" data-testid="admin-leads-refresh-btn" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        <Button className="btn-primary" data-testid="admin-leads-export-btn" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
      </div>

      <div className="mt-5 rounded-xl border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Company / Contact</TableHead>
              <TableHead>Days × Rate</TableHead>
              <TableHead>Fee (20%)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 opacity-60">Loading…</TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 opacity-60" data-testid="admin-leads-empty">No leads yet</TableCell></TableRow>
            ) : leads.map((l) => (
              <TableRow key={l.id} data-testid={`admin-lead-row-${l.id}`}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleDateString("de-DE")}</TableCell>
                <TableCell className="font-medium">{l.manager_name || <span className="opacity-50">—</span>}</TableCell>
                <TableCell>
                  <div className="font-medium">{l.company_name}</div>
                  <div className="text-xs opacity-70">{l.contact_name} · <a className="underline" href={`mailto:${l.email}`}>{l.email}</a></div>
                  {l.message && <div className="text-xs opacity-60 mt-1 max-w-xs truncate" title={l.message}>{l.message}</div>}
                  {l.conversation_id && <Link to={`/messages?c=${l.conversation_id}`} className="text-xs text-[var(--brand-blue)] underline inline-flex items-center gap-1 mt-1" data-testid={`admin-lead-chat-${l.id}`}><MessageSquare className="h-3 w-3" />Open chat</Link>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{l.days} × €{l.daily_rate_eur}</TableCell>
                <TableCell className="font-semibold whitespace-nowrap">€{Number(l.fee_eur).toLocaleString("de-DE")}</TableCell>
                <TableCell>
                  <Select value={l.status || "new"} onValueChange={(s) => updateStatus(l.id, s)}>
                    <SelectTrigger className="h-8 w-36 border-0 p-0 shadow-none" data-testid={`admin-lead-status-${l.id}`}>
                      <Badge className={`border ${STATUS_STYLE[l.status || "new"]}`}>{l.status || "new"}</Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
