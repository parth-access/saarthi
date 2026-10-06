import { firestoreBookingRepository } from '@/domains/booking';

export class BookingService {
  static async getBookingsByTherapist(therapistId: string) {
    return firestoreBookingRepository.findByTherapistId(therapistId);
  }
}