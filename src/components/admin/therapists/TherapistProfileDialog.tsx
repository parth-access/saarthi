'use client';

/**
 * Add / edit a therapist's public profile from the admin console.
 *
 * One form for both modes. Photos are resized in the browser to a ≤800px WebP
 * before upload, so a phone photo never ships megabytes to the booking page.
 * Bookability and schedule are NOT edited here — they keep their own audited
 * controls on the detail page.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { ConfirmDialog } from '../ConfirmDialog';
import { toneClasses } from '../bookings/adminBookingPresentation';

export interface TherapistProfileValues {
  name: string;
  slug: string;
  specialization: string;
  experience: string;
  bio: string;
  image: string;
  loginEmail: string;
  sessionPrice: string;
  inPersonPrice: string;
}

export const EMPTY_PROFILE: TherapistProfileValues = {
  name: '',
  slug: '',
  specialization: '',
  experience: '',
  bio: '',
  image: '',
  loginEmail: '',
  sessionPrice: '',
  inPersonPrice: '',
};

const MAX_PX = 800;
const WEBP_QUALITY = 0.8;

/** Resize + re-encode to WebP in the browser. */
async function toWebpDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', WEBP_QUALITY);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function priceOrNull(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isInteger(n) && n > 0 ? n : 'invalid';
}

export function TherapistProfileDialog({
  mode,
  therapistId,
  initial,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  therapistId?: string;
  initial: TherapistProfileValues;
  onClose: () => void;
  /** Called with the therapist id and a summary line after a successful save. */
  onSaved: (therapistId: string, summary: string) => void;
}) {
  const [values, setValues] = useState<TherapistProfileValues>(initial);
  const [slugTouched, setSlugTouched] = useState(mode === 'edit' && initial.slug !== '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof TherapistProfileValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const v = e.target.value;
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      if (key === 'name' && !slugTouched) next.slug = slugify(v);
      return next;
    });
    if (key === 'slug') setSlugTouched(true);
  };

  async function uploadPhoto(file: File) {
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await toWebpDataUrl(file);
      const res = await fetchWithAuth('/api/admin/therapists/photo', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) throw new Error(body?.error || 'The photo could not be uploaded.');
      setValues((prev) => ({ ...prev, image: body.url as string }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The photo could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    if (saving) return;
    setError(null);
    const sessionPrice = priceOrNull(values.sessionPrice);
    const inPersonPrice = priceOrNull(values.inPersonPrice);
    if (sessionPrice === 'invalid' || inPersonPrice === 'invalid') {
      setError('Prices must be whole rupees, e.g. 1500.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        slug: values.slug,
        specialization: values.specialization,
        experience: values.experience,
        bio: values.bio,
        image: values.image,
        loginEmail: values.loginEmail,
        sessionPrice,
        inPersonPrice,
      };
      const res = await fetchWithAuth(
        mode === 'create'
          ? '/api/admin/therapists'
          : `/api/admin/therapists/${encodeURIComponent(therapistId ?? '')}`,
        { method: mode === 'create' ? 'POST' : 'PATCH', body: JSON.stringify(payload) }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || 'The profile could not be saved.');
      onSaved(mode === 'create' ? (body.therapistId as string) : (therapistId as string), body.summary as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-sm text-primary';
  const label = 'block text-xs font-medium text-primary';
  const hint = 'mt-0.5 text-[0.6875rem] text-muted-foreground';

  return (
    <ConfirmDialog
      title={mode === 'create' ? 'Add therapist' : `Edit ${initial.name || 'therapist'}`}
      subtitle={
        mode === 'create'
          ? 'New therapists start not bookable. Add their schedule next, then mark them bookable.'
          : 'Changes appear on the public site and booking page straight away.'
      }
      onClose={() => {
        if (!saving) onClose();
      }}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || uploading || values.name.trim().length < 2}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create therapist' : 'Save profile'}
          </Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {error && (
          <p role="alert" className={`rounded-lg px-2.5 py-1.5 text-xs ${toneClasses('warning')}`}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-hairline bg-neutral-surface">
            {values.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.image} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : values.image ? 'Replace photo' : 'Upload photo'}
            </Button>
            <input
              aria-label="Photo URL"
              placeholder="…or paste an image URL"
              value={values.image}
              onChange={set('image')}
              className={`${field} mt-1.5 text-xs`}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="tp-name">Full name *</label>
          <input id="tp-name" value={values.name} onChange={set('name')} maxLength={100} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="tp-slug">Profile URL slug</label>
          <input id="tp-slug" value={values.slug} onChange={set('slug')} maxLength={60} className={field} />
          <p className={hint}>Used in booking links: /book?therapist={values.slug || 'slug'}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="tp-spec">Specialization</label>
            <input id="tp-spec" value={values.specialization} onChange={set('specialization')} maxLength={150} className={field} placeholder="Clinical Psychologist" />
          </div>
          <div>
            <label className={label} htmlFor="tp-exp">Experience</label>
            <input id="tp-exp" value={values.experience} onChange={set('experience')} maxLength={60} className={field} placeholder="3+ Years" />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="tp-bio">Bio</label>
          <textarea id="tp-bio" value={values.bio} onChange={set('bio')} maxLength={2000} rows={4} className={field} />
          <p className={hint}>{values.bio.length}/2000</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="tp-price">Online session price (₹)</label>
            <input id="tp-price" inputMode="numeric" value={values.sessionPrice} onChange={set('sessionPrice')} className={field} placeholder="1500 (default)" />
          </div>
          <div>
            <label className={label} htmlFor="tp-price-ip">In-person price (₹)</label>
            <input id="tp-price-ip" inputMode="numeric" value={values.inPersonPrice} onChange={set('inPersonPrice')} className={field} placeholder="2000 (default)" />
          </div>
        </div>
        <p className={hint}>Leave a price blank to use the platform default. Existing bookings keep the price they were made at.</p>

        <div>
          <label className={label} htmlFor="tp-email">Therapist&apos;s sign-in email</label>
          <input id="tp-email" type="email" value={values.loginEmail} onChange={set('loginEmail')} maxLength={200} className={field} />
          <p className={hint}>
            Links their Saarthi account so they can use the therapist dashboard. Also give them the
            therapist role under Users &amp; roles.
          </p>
        </div>
      </div>
    </ConfirmDialog>
  );
}
