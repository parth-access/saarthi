export type BookingStatus = 'pending' | 'confirmed' | 'rejected';

export interface Booking {
  id: string;
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
}

export type SessionType = 'Individual' | 'Couple' | 'Family' | 'Teen';
