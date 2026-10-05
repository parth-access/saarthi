import { describe, expect, it } from 'vitest';
import type { Therapist } from '@/types';
import {
  DRAVINA_THERAPIST,
  getTherapistBookingHref,
  resolveBookTherapist,
} from './therapists';

const therapist = (overrides: Partial<Therapist>): Therapist => ({
  id: 'generated-id',
  name: 'Therapist',
  specialization: 'Counsellor',
  experience: '2 years',
  bio: 'Bio',
  image: '',
  active: true,
  ...overrides,
});

describe('therapist booking deep links', () => {
  const activeTherapists = [
    therapist({ id: 'firestore-dravina-id', slug: 'dravina', name: 'Dravina Gupta' }),
    therapist({ id: 'therapist-2', slug: 'another-therapist' }),
  ];

  it('resolves an active therapist by Firestore ID', () => {
    expect(resolveBookTherapist(activeTherapists, 'therapist-2')?.id).toBe('therapist-2');
  });

  it('resolves an active therapist by slug regardless of their backing ID', () => {
    expect(resolveBookTherapist(activeTherapists, 'dravina')?.id).toBe('firestore-dravina-id');
  });

  it.each([undefined, null, '', 'unknown'])('ignores a missing or invalid value: %s', (value) => {
    expect(resolveBookTherapist(activeTherapists, value)).toBeNull();
  });

  it('ignores inactive therapists', () => {
    const inactive = therapist({ id: 'inactive-id', slug: 'inactive', active: false });

    expect(resolveBookTherapist([inactive], 'inactive-id')).toBeNull();
    expect(resolveBookTherapist([inactive], 'inactive')).toBeNull();
  });

  it('ignores an ambiguous ID or slug', () => {
    const ambiguous = [
      therapist({ id: 'first', slug: 'shared' }),
      therapist({ id: 'shared', slug: 'second' }),
    ];

    expect(resolveBookTherapist(ambiguous, 'shared')).toBeNull();
  });

  it('builds Dravina’s booking URL from the stable slug, not fallback ID 1', () => {
    expect(getTherapistBookingHref(DRAVINA_THERAPIST)).toBe('/book?therapist=dravina');
  });
});
