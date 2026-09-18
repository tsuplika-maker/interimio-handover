import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog.jsx";
import { Textarea } from "./ui/textarea.jsx";
import { Calendar } from "./ui/calendar.jsx";
import { api, errMsg } from "../lib/api";

export function RequestDialog({ manager, onRequest }) {
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
      const res = await api.post("/leads", payload);
      toast.success(`Request sent. Estimated service fee: €${res.data.fee_eur}`);
      onRequest && onRequest();
    } catch (e) {
      toast.error(errMsg(e, "Could not send request"));
    }
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="request-dialog">
      <DialogHeader>
        <DialogTitle>Request {manager.name}</DialogTitle>
        <DialogDescription>Clients must be logged in and verified (email) to contact a manager. Service fee is 20% per day.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Company</Label>
            <Input data-testid="request-company-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="Your company" />
          </div>
          <div>
            <Label>Contact name</Label>
            <Input data-testid="request-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input data-testid="request-email-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <Label>Days</Label>
            <Input data-testid="request-days-input" type="number" min={1} value={days} onChange={e => setDays(e.target.value)} />
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
          <Textarea data-testid="request-message-input" value={message} onChange={e => setMessage(e.target.value)} placeholder="Tell us about your need" />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-md border p-3">
          <div className="text-sm">Estimated service fee (20%):</div>
          <div className="text-lg font-semibold" data-testid="request-fee">€{fee}</div>
        </div>
      </div>
      <DialogFooter>
        <Button className="btn-primary" data-testid="request-submit-btn" onClick={submit}>Send request</Button>
      </DialogFooter>
    </DialogContent>
  );
}
