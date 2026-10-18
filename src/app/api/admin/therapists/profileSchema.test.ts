import { describe, it, expect } from 'vitest';
import { therapistProfileSchema } from './profileSchema';

describe('therapistProfileSchema', () => {
  it('accepts a full profile and normalises blanks to null', () => {
    const r = therapistProfileSchema.parse({
      name: '  Asha Rao ',
      slug: 'Asha-Rao',
      specialization: '',
      bio: 'Hello',
      image: '/dravina.webp',
      loginEmail: 'ASHA@example.com',
      sessionPrice: 1800,
      inPersonPrice: null,
    });
    expect(r.name).toBe('Asha Rao');
    expect(r.slug).toBe('asha-rao');
    expect(r.specialization).toBeNull();
    expect(r.loginEmail).toBe('asha@example.com');
  });

  it('rejects bad slugs, prices and image URLs', () => {
    expect(therapistProfileSchema.safeParse({ name: 'Asha', slug: 'asha rao' }).success).toBe(false);
    expect(therapistProfileSchema.safeParse({ name: 'Asha', sessionPrice: 99.5 }).success).toBe(false);
    expect(therapistProfileSchema.safeParse({ name: 'Asha', image: 'javascript:alert(1)' }).success).toBe(false);
    expect(therapistProfileSchema.safeParse({ name: 'A' }).success).toBe(false);
  });
});
