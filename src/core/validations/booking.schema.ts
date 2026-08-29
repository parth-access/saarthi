import { z } from "zod";

const phoneRegex = new RegExp(
  /^([+]?[\s0-9]+)?(\d{3}|[(]?[0-9]+[)])?([-]?[\s]?[0-9])+$/
);

export const bookingFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(6, "Phone number is too short").max(20, "Phone number is too long").regex(phoneRegex, "Please enter a valid phone number").transform(val => val.trim()),
  gender: z.string().min(1, "Please select gender"),
  age: z.string().refine(v => !isNaN(parseInt(v)) && parseInt(v) > 0, "Invalid age"),
  message: z.string().optional(),
  consent: z.boolean().refine((val) => val === true, {
    message: "You must consent to the Privacy Policy & confidential therapy services to proceed"
  })
});

export type BookingFormData = z.infer<typeof bookingFormSchema>;
