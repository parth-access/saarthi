import { z } from 'zod';

const SESSION_TYPES = ["Individual", "Couple", "Family", "Teen"] as const;

export const bookingSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:mm format"),
  therapistId: z.string().min(1, "Therapist choice is required"),
  sessionType: z.enum(SESSION_TYPES),
  gender: z.string().min(1, "Gender selection is required"),
  age: z.coerce.number().int().min(1).max(120),
  message: z.string().optional(),
  lockId: z.string().min(1, "Session lock is required")
});

export type BookingInput = z.infer<typeof bookingSchema>;

export const statusUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'confirmed', 'rejected', 'completed', 'cancelled'])
});
