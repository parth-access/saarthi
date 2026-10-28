import { listAvailability } from "../../_lib/availabilityRead";

/**
 * A therapist's date exceptions (closed days), read for the schedule editor.
 * Changes go through POST /api/therapist/schedule, which validates them and
 * checks their effect on booked sessions.
 */
export async function GET(request: Request) {
  return listAvailability(request, "overrides", "READ_OVERRIDES");
}
