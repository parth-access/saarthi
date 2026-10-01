import { Therapist } from '@/types';

/**
 * Single source of truth for the core featured / founding therapists
 */
export const DRAVINA_THERAPIST: Therapist = {
  id: '1',
  name: 'Dravina Gupta',
  slug: 'dravina',
  specialization: 'Psychologist & Clinical Counsellor',
  experience: '1+ Years',
  bio: 'Specializing in anxiety, depression, anger management, and mindfulness-based stress reduction. Master’s in Clinical Psychology.',
  image: '/dravina.png',
  active: true,
};

export const DEFAULT_THERAPISTS: Therapist[] = [
  DRAVINA_THERAPIST,
];

/**
 * Prefer the public slug when one exists so links remain stable if a
 * therapist's backing document ID changes (for example, Dravina's fallback
 * record uses "1" while Firestore may use a generated ID).
 */
export const getTherapistBookingHref = (therapist: Therapist) =>
  `/book?therapist=${encodeURIComponent(therapist.slug || therapist.id)}`;

/**
 * Resolve a booking deep link only when it identifies exactly one active
 * therapist. Treating duplicate IDs/slugs as ambiguous prevents a query
 * parameter from silently selecting the wrong person.
 */
export const resolveBookTherapist = (
  therapists: Therapist[],
  requestedTherapist?: string | null
): Therapist | null => {
  if (!requestedTherapist) return null;

  const matches = therapists.filter(
    (therapist) =>
      therapist.active &&
      (therapist.id === requestedTherapist || therapist.slug === requestedTherapist)
  );

  return matches.length === 1 ? matches[0] : null;
};

/**
 * Helper to determine profile vs direct booking URL for any therapist
 */
export const getTherapistCtaDetails = (therapist: Therapist) => {
  if (therapist.slug) {
    return {
      href: `/therapists/${therapist.slug}`,
      label: 'Know Your Saarthi',
      isProfile: true,
    };
  }
  return {
    href: getTherapistBookingHref(therapist),
    label: 'Book a Session',
    isProfile: false,
  };
};
