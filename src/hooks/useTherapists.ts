import { Therapist } from '../types';

export const STATIC_THERAPISTS: Therapist[] = [
  {
    id: 'dravina',
    name: 'Dravina Khokhar',
    specialization: 'Counseling Psychologist',
    experience: '3+ years',
    bio: 'Dedicated to helping individuals find their path to healing.',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80',
    active: true
  }
];

export function useTherapists() {
  return { 
    therapists: STATIC_THERAPISTS, 
    loading: false, 
    error: null 
  };
}
