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
    href: `/book?therapist=${encodeURIComponent(therapist.id)}`,
    label: 'Book a Session',
    isProfile: false,
  };
};
