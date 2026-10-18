import { z } from 'zod';

/**
 * The editable public profile of a therapist, shared by the create (POST
 * /api/admin/therapists) and edit (PATCH /api/admin/therapists/{id}) routes so
 * both validate identically.
 *
 * Authority fields are deliberately absent: `active` has its own audited
 * bookability route, `authId` is derived server-side from `loginEmail`, and
 * the user's role is changed under Users & roles.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const price = z
  .number()
  .int('Prices must be whole rupees.')
  .min(1, 'Prices must be at least ₹1.')
  .max(100000, 'Prices cannot exceed ₹1,00,000.')
  .nullable()
  .optional();

/** Root-relative public path, or an https URL (Firebase Storage upload). */
const imageUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || v.startsWith('https://') || /^\/[A-Za-z0-9._\-/]+$/.test(v), {
    message: 'Photo must be an https URL or a path such as /dravina.webp.',
  })
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional();

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const therapistProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60)
    .refine((v) => v === '' || SLUG_PATTERN.test(v), {
      message: 'Slug may use lowercase letters, numbers and single hyphens (e.g. "asha-rao").',
    })
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
  specialization: optionalText(150),
  experience: optionalText(60),
  bio: optionalText(2000),
  image: imageUrl,
  /** The therapist's sign-in email; links their account when it exists. */
  loginEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, { message: 'Enter a valid email.' })
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
  sessionPrice: price,
  inPersonPrice: price,
});

export type TherapistProfileInput = z.infer<typeof therapistProfileSchema>;

/** First validation message, for a single-line error in the console. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Some fields are not valid.';
}
