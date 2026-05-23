import { z } from 'zod';

export const bookingSchema = z.object({
  lockId: z.string().optional(),
  therapistId: z.string().min(1, "Therapist ID is required"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  date: z.string(),
  time: z.string(),
  sessionType: z.string().optional(),
  sessionMode: z.string().optional(),
  message: z.string().optional(),
  gender: z.string().optional(),
  age: z.union([z.string(), z.number()]).optional(),
});

export const rescheduleBookingSchema = z.object({
  bookingId: z.string().min(1),
  therapistId: z.string().min(1),
  date: z.string(),
  time: z.string(),
  reason: z.string().optional()
});

export const declineBookingSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().optional()
});

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(['approved', 'declined', 'completed', 'cancelled'])
});

export const lockSlotSchema = z.object({
  therapistId: z.string().min(1),
  date: z.string(),
  time: z.string()
});
