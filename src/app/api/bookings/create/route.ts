import { BookingController } from '@/server/controllers/BookingController';

export async function POST(req: Request) {
  return BookingController.createBooking(req);
}
