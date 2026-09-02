import { z } from "zod";
import { AGE_RANGE_MESSAGE, parseValidClientAge } from "@/shared/validation/age";

const phoneRegex = new RegExp(
  /^([+]?[\s0-9]+)?(\d{3}|[(]?[0-9]+[)])?([-]?[\s]?[0-9])+$/
);

export const bookingFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(6, "Phone number is too short").max(20, "Phone number is too long").regex(phoneRegex, "Please enter a valid phone number").transform(val => val.trim()),
  gender: z.string().min(1, "Please select gender"),
  // Stays a string because it is bound to `<input type="number">`, but it is now
  // validated with the SAME rule the server applies (`bookingSchema.age`). The old
  // rule was `parseInt(v) > 0`, which accepted '1' and '18abc' — so the intake form
  // happily submitted ages the server then stored verbatim.
  age: z.string().refine(v => parseValidClientAge(v) !== null, AGE_RANGE_MESSAGE),
  message: z.string().optional(),
  consent: z.boolean().refine((val) => val === true, {
    message: "You must consent to the Privacy Policy & confidential therapy services to proceed"
  })
});

export type BookingFormData = z.infer<typeof bookingFormSchema>;
