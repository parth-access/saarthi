export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  therapistId: string;
  name: string;
  email: string;
  gender: string;
  age: number;
  date: string;
  time: string;
  sessionType: string;
  message: string;
  status: BookingStatus;
  createdAt: any;
  updatedAt?: any;
}

export interface Therapist {
  id: string;
  name: string;
  specialization: string;
  experience: string;
  bio: string;
  image: string;
  active: boolean;
}

export interface AvailabilityConfig {
  id: string;
  therapistId: string;
  dayOfWeek: number; // 0-6
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  slotDuration: number; // minutes
}

export type SessionType = 'Individual' | 'Couple' | 'Family' | 'Teen';
