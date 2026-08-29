import { z } from 'zod';

export const bookingSchema = z.object({
  lockId: z.string().optional(),
  therapistId: z.string().min(1, "Therapist ID is required"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  sessionType: z.string().optional(),
  sessionMode: z.string().optional(),
  message: z.string().optional(),
  gender: z.string().optional(),
  age: z.union([z.string(), z.number()]).optional(),
  email: z.string().email("Valid email address is required"),
}).strict();

export const rescheduleBookingSchema = z.object({
  bookingId: z.string().min(1),
  therapistId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  reason: z.string().optional()
}).strict();

export const declineBookingSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().optional()
}).strict();

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(['approved', 'declined', 'completed', 'cancelled'])
}).strict();

export const lockSlotSchema = z.object({
  therapistId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1)
}).strict();

