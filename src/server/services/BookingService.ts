import { firestoreBookingRepository } from '@/domains/booking';

export class BookingService {
  static async getBookings() {
    return firestoreBookingRepository.findAll();
  }

  static async getBookingsByTherapist(therapistId: string) {
    return firestoreBookingRepository.findByTherapistId(therapistId);
  }
}