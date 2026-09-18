import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "../ui/button.jsx";
import { Input } from "../ui/input.jsx";
import { Label } from "../ui/label.jsx";
import { Badge } from "../ui/badge.jsx";
import { Switch } from "../ui/switch.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.jsx";
import { api, errMsg } from "../../lib/api";

function CreateCodeForm({ onCreated }) {
  const [code, setCode] = useState("");
  const [type, setType] = useState("percent");
  const [value, setValue] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    try {
      const payload = { code: code.trim().toUpperCase(), assigned_to: assignedTo || null, notes: notes || null, is_active: true };
      if (type === "percent") payload.percent_off = Number(value); else payload.amount_off_eur = Number(value);
      await api.post("/discount-codes", payload);
      toast.success(`Code ${payload.code} created`);
      setCode(""); setValue(""); setAssignedTo(""); setNotes("");
      onCreated();
    } catch (e) {
      toast.error(errMsg(e, "Could not create code"));
    }
  };

  return (
    <Card data-testid="admin-code-create-card">
      <CardHeader><CardTitle className="text-base">New discount code</CardTitle><CardDescription>Assign codes to shareholders or partners for the upcoming Pro plan</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-5 items-end">
        <div><Label>Code</Label><Input data-testid="admin-code-input" placeholder="SHARE10" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger data-testid="admin-code-type-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="percent">% off</SelectItem><SelectItem value="amount">€ off</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>{type === "percent" ? "Percent" : "Amount (€)"}</Label><Input data-testid="admin-code-value-input" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <div><Label>Assigned to</Label><Input data-testid="admin-code-assigned-input" placeholder="Shareholders" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} /></div>
        <Button className="btn-primary" data-testid="admin-code-create-btn" onClick={submit}>Create</Button>
        <div className="md:col-span-5"><Label>Notes</Label><Input data-testid="admin-code-notes-input" placeholder="Optional internal note" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </CardContent>
    </Card>
  );
}

export function AdminDiscountCodes() {
  const [codes, setCodes] = useState([]);

  const load = async () => {
    try {
      const res = await api.get("/admin/discount-codes");
      setCodes(res.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Could not load codes"));
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (c, active) => {
    try {
      await api.patch(`/admin/discount-codes/${c.id}`, { is_active: active });
      setCodes((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: active } : x)));
      toast.success(`${c.code} ${active ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(errMsg(e, "Could not update code"));
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete code ${c.code}?`)) return;
    try {
      await api.delete(`/admin/discount-codes/${c.id}`);
      setCodes((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("Code deleted");
    } catch (e) {
      toast.error(errMsg(e, "Could not delete code"));
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-discount-codes">
      <CreateCodeForm onCreated={load} />
      <div className="rounded-xl border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 opacity-60" data-testid="admin-codes-empty">No codes yet</TableCell></TableRow>
            ) : codes.map((c) => (
              <TableRow key={c.id} data-testid={`admin-code-row-${c.code}`}>
                <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                <TableCell>{c.percent_off != null ? `${c.percent_off}%` : `€${c.amount_off_eur}`}</TableCell>
                <TableCell>
                  <div>{c.assigned_to || <span className="opacity-50">—</span>}</div>
                  {c.notes && <div className="text-xs opacity-60">{c.notes}</div>}
                </TableCell>
                <TableCell><Badge variant="outline" data-testid={`admin-code-uses-${c.code}`}>{c.uses}</Badge></TableCell>
                <TableCell><Switch data-testid={`admin-code-toggle-${c.code}`} checked={!!c.is_active} onCheckedChange={(v) => toggle(c, v)} /></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" data-testid={`admin-code-delete-${c.code}`} onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
