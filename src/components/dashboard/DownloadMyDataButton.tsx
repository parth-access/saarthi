'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

/** Downloads everything Saarthi holds about the signed-in client as JSON. */
export function DownloadMyDataButton() {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/me/data-export');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'We could not prepare your data right now.');
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'saarthi-my-data.json';
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success('Your data has been downloaded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'We could not prepare your data right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={busy} className="cursor-pointer">
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
      {busy ? 'Preparing…' : 'Download my data'}
    </Button>
  );
}
