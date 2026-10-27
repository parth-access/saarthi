import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { checkTherapistAccess } from "./authCheck";
import { logger } from "../../_lib/logger";

/**
 * GET ?therapistId=… for a therapist's recurring rules or date overrides,
 * for the schedule builder. Same access as the writes beside it: the owning
 * therapist or an admin. Under Better Auth the browser can't read these from
 * Firestore (the rules require a Firebase sign-in), so it reads here.
 */
export async function listAvailability(
  request: Request,
  kind: "recurringRules" | "overrides",
  action: string
): Promise<Response> {
  const therapistId = new URL(request.url).searchParams.get("therapistId");
  if (!therapistId) {
    return NextResponse.json({ error: "Missing therapistId" }, { status: 400 });
  }

  const checkResult = await checkTherapistAccess(request, therapistId, action);
  if (!checkResult.authorized) {
    return checkResult.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const snapshot = await adminDb.collection(`therapistAvailability/${therapistId}/${kind}`).get();
    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    logger.error("THERAPIST_MUTATION", `Failed to read ${kind}`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
