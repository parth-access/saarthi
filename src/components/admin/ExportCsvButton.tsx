'use client';

/**
 * "Export CSV" for the admin console. Picks a date range (defaults to this
 * month in IST), downloads the file via the authenticated export route, and
 * says how many rows it contained.
 */
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { ConfirmDialog } from './ConfirmDialog';
import { toneClasses } from './bookings/adminBookingPresentation';

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function ExportCsvButton({ type }: { type: 'bookings' | 'payments' }) {
  const today = istToday();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  const label = type === 'bookings' ? 'bookings' : 'payments';
  const basis = type === 'bookings' ? 'session date' : 'payment date';

  function preset(kind: 'this' | 'last' | 'fy') {
    const [y, m] = today.split('-').map(Number);
    if (kind === 'this') {
      setFrom(`${today.slice(0, 7)}-01`);
      setTo(today);
    } else if (kind === 'last') {
      const first = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      setFrom(first.toISOString().slice(0, 10));
      setTo(last.toISOString().slice(0, 10));
    } else {
      const fyStart = m >= 4 ? y : y - 1; // Indian financial year: 1 Apr – 31 Mar
      setFrom(`${fyStart}-04-01`);
      setTo(today);
    }
  }

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetchWithAuth(
        `/api/admin/export?type=${type}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'The export could not be created.');
      }
      const rows = Number(res.headers.get('X-Export-Rows') ?? '0');
      const truncated = res.headers.get('X-Export-Truncated') === '1';
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `saarthi-${type}-${from}-to-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setOpen(false);
      setMessage({
        tone: truncated ? 'warning' : 'success',
        text: truncated
          ? `Downloaded the first ${rows.toLocaleString('en-IN')} ${label}. Narrow the range to get the rest.`
          : `Downloaded ${rows.toLocaleString('en-IN')} ${label}.`,
      });
    } catch (e) {
      setMessage({ tone: 'warning', text: e instanceof Error ? e.message : 'The export could not be created.' });
    } finally {
      setBusy(false);
    }
  }

  const input = 'mt-1 w-full rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-sm text-primary';

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Export CSV
      </Button>
      {message && !open && (
        <p role="status" className={`mt-1 rounded px-2 py-1 text-[0.6875rem] ${toneClasses(message.tone)}`}>
          {message.text}
        </p>
      )}
      {open && (
        <ConfirmDialog
          title={`Export ${label}`}
          subtitle={`A spreadsheet of ${label} by ${basis} (IST).`}
          onClose={() => !busy && setOpen(false)}
          busy={busy}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={download} disabled={busy || !from || !to || from > to}>
                {busy ? 'Preparing…' : 'Download CSV'}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs">
            {message?.tone === 'warning' && (
              <p role="alert" className={`rounded-lg px-2.5 py-1.5 ${toneClasses('warning')}`}>{message.text}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => preset('this')}>This month</Button>
              <Button variant="ghost" size="sm" onClick={() => preset('last')}>Last month</Button>
              <Button variant="ghost" size="sm" onClick={() => preset('fy')}>This financial year</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block font-medium text-primary">
                From
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input} />
              </label>
              <label className="block font-medium text-primary">
                To
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} />
              </label>
            </div>
            <p className="leading-relaxed text-muted-foreground">
              {type === 'bookings'
                ? "Includes client contact details and payment/refund state. Clients' private notes and session notes are never exported."
                : 'One row per payment record with its Razorpay IDs.'}{' '}
              Every export is recorded in the activity log. Keep downloaded files private.
            </p>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
