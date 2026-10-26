/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The booking fields a listener reads, whichever shape the event arrived in.
 *
 * Most booking events are recorded flat by BookingDomainService
 * (`{ bookingId, therapistId, reason, customNote, ... }`); a few emitters
 * (sessionLifecycleService, AdminConfirmBookingCommand) nest a `booking`
 * snapshot instead. Listeners used to read `payload.booking.x` unconditionally,
 * which threw on every flat event, failed the outbox row and dropped the
 * decline email. Nested fields win; flat names are mapped onto the booking's.
 */
export function bookingFromPayload(payload: any): Record<string, any> {
  const flat = payload ?? {};
  return {
    ...flat,
    declineReason: flat.declineReason ?? flat.reason,
    declineCustomNote: flat.declineCustomNote ?? flat.customNote,
    paymentAmount: flat.paymentAmount ?? flat.amount,
    paymentCurrency: flat.paymentCurrency ?? flat.currency,
    ...(flat.booking ?? {}),
  };
}
