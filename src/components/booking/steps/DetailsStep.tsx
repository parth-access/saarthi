import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { bookingFormSchema, BookingFormData as FormData } from "../../../core/validations/booking.schema"
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"
import { Button } from "../../ui/Button"
import { Input } from "../../ui/Input"
import { Textarea } from "../../ui/Textarea"

const formSchema = bookingFormSchema;

interface Props {
  initialData: any;
  onNext: (data: FormData) => void;
  onBack: () => void;
}

export const DetailsStep = ({ initialData, onNext, onBack }: Props) => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData.name || "",
      email: initialData.email || "",
      phone: initialData.phone || "",
      gender: initialData.gender || "",
      age: initialData.age || "",
      message: initialData.message || ""
    }
  });

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary">Your Details</h3>
        <p className="text-muted-foreground mt-2">Almost there! We just need some details.</p>
      </div>

      <form onSubmit={handleSubmit(onNext)} className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Full Name</label>
            <Input {...register("name")} placeholder="E.g. Siddharth Singh" className="h-14 rounded-2xl bg-primary/5 border-none" />
            {errors.name && <p className="text-xs text-red-500 ml-1">{errors.name.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Email Address</label>
            <Input {...register("email")} type="email" placeholder="E.g. sidd@email.com" className="h-14 rounded-2xl bg-primary/5 border-none" />
            {errors.email && <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Phone Number</label>
            <Input {...register("phone")} type="tel" autoComplete="tel" placeholder="+91 98765 43210" className="h-14 rounded-2xl bg-primary/5 border-none" />
            {errors.phone && <p className="text-xs text-red-500 ml-1">{errors.phone.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Gender</label>
            <select 
              {...register("gender")}
              className="flex h-14 w-full rounded-2xl bg-primary/5 border-none px-4 text-sm appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%235A5A40%22%20stroke-width%3D%221.67%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_15px_center] bg-no-repeat"
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            {errors.gender && <p className="text-xs text-red-500 ml-1">{errors.gender.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Age</label>
            <Input {...register("age")} type="number" placeholder="Age" className="h-14 rounded-2xl bg-primary/5 border-none" />
            {errors.age && <p className="text-xs text-red-500 ml-1">{errors.age.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Message</label>
          <Textarea {...register("message")} placeholder="Optional note..." rows={4} className="rounded-[2rem] bg-primary/5 border-none p-6" />
        </div>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="ghost" className="rounded-full" onClick={onBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
          <Button type="submit" className="rounded-full px-12">
            Review Request <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
