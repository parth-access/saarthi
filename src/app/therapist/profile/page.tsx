'use client';

/**
 * Therapist "Profile" page — edit how you appear to clients: photo,
 * specialization, experience and bio. Name, profile link and prices are set by
 * the practice and shown read-only here.
 */
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { toWebpDataUrl } from '@/components/admin/therapists/TherapistProfileDialog';
import { sessionPriceDisplayFor } from '@/components/booking/bookingUi';
import { useTherapistData } from '../layout';

export default function TherapistProfilePage() {
  const data = useTherapistData();
  const t = data.therapist;

  const [form, setForm] = React.useState({ specialization: '', experience: '', bio: '', image: '' });
  const [loadedId, setLoadedId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Seed the form once per therapist record (not on every refresh mid-edit).
  React.useEffect(() => {
    if (t && t.id !== loadedId) {
      setForm({
        specialization: t.specialization || '',
        experience: t.experience || '',
        bio: t.bio || '',
        image: t.image || '',
      });
      setLoadedId(t.id);
    }
  }, [t, loadedId]);

  if (!t) {
    return (
      <div className="rounded-xl border border-dashed border-hairline bg-white px-5 py-8 text-center shadow-sm">
        <p className="text-sm font-medium text-primary">Profile not ready</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {data.loading ? 'Loading your profile…' : 'No therapist profile is linked to this account yet. Ask the practice to link it.'}
        </p>
      </div>
    );
  }

  const dirty =
    form.specialization !== (t.specialization || '') ||
    form.experience !== (t.experience || '') ||
    form.bio !== (t.bio || '') ||
    form.image !== (t.image || '');

  async function upload(file: File) {
    setUploading(true);
    try {
      const dataUrl = await toWebpDataUrl(file);
      const res = await fetchWithAuth('/api/admin/therapists/photo', { method: 'POST', body: JSON.stringify({ dataUrl }) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) throw new Error(body?.error || 'The photo could not be uploaded.');
      setForm((f) => ({ ...f, image: body.url as string }));
      toast.success('Photo uploaded — save to publish it.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The photo could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/therapist/profile', { method: 'PATCH', body: JSON.stringify(form) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || 'Your profile could not be saved.');
      toast.success('Profile saved. It is live on the website now.');
      setLoadedId(null); // re-seed from the refreshed record
      data.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Your profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-primary';
  const label = 'block text-xs font-medium text-primary';

  return (
    <section className="space-y-4">
      <div className="border-b border-hairline pb-2.5">
        <h2 className="font-serif text-base font-semibold text-primary">Your profile</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This is what clients see on the Therapists page and when booking.
        </p>
      </div>

      {t.archived && (
        <p className="rounded-lg bg-neutral-surface px-3 py-2 text-xs text-primary/80">
          Your profile has been archived by the practice, so it can&apos;t be edited.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4 rounded-xl border border-hairline bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-hairline bg-neutral-surface">
              {form.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image} alt="Your profile photo" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || t.archived}>
                {uploading ? 'Uploading…' : form.image ? 'Change photo' : 'Upload photo'}
              </Button>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">A clear, friendly headshot works best.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="p-spec">Specialization</label>
              <input id="p-spec" value={form.specialization} maxLength={150} disabled={t.archived}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })} className={field}
                placeholder="e.g. Clinical Psychologist" />
            </div>
            <div>
              <label className={label} htmlFor="p-exp">Experience</label>
              <input id="p-exp" value={form.experience} maxLength={60} disabled={t.archived}
                onChange={(e) => setForm({ ...form, experience: e.target.value })} className={field}
                placeholder="e.g. 3+ Years" />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="p-bio">About you</label>
            <textarea id="p-bio" value={form.bio} maxLength={2000} rows={7} disabled={t.archived}
              onChange={(e) => setForm({ ...form, bio: e.target.value })} className={field}
              placeholder="Your approach, the people you work with, what a first session looks like…" />
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{form.bio.length}/2000</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => setLoadedId(null)}>
              Discard changes
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving || uploading || t.archived}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </div>

        <aside className="space-y-2 rounded-xl border border-hairline bg-white p-4 text-xs shadow-sm">
          <p className="font-medium text-primary">Set by the practice</p>
          <dl className="space-y-1.5 text-muted-foreground">
            <div><dt className="inline font-medium text-primary/80">Name: </dt><dd className="inline">{t.name}</dd></div>
            <div><dt className="inline font-medium text-primary/80">Session price: </dt><dd className="inline">{sessionPriceDisplayFor(t)}</dd></div>
            {t.slug && (
              <div><dt className="inline font-medium text-primary/80">Booking link: </dt><dd className="inline break-all">/book?therapist={t.slug}</dd></div>
            )}
          </dl>
          <p className="pt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
            To change these, contact the practice administrator.
          </p>
        </aside>
      </div>
    </section>
  );
}
