import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { checkTherapistAccess } from "../_lib/authCheck";
import { logger } from "../../../api/therapist/_lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { therapistId, active } = body;

    if (!therapistId || typeof active !== "boolean") {
      return NextResponse.json({ error: "Missing therapistId or invalid active status" }, { status: 400 });
    }

    // Verify authentication and authorization (admin, or therapist ownership)
    const checkResult = await checkTherapistAccess(request, therapistId, "UPDATE_THERAPIST_STATUS");
    if (!checkResult.authorized) {
      return checkResult.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update with adminDb
    const docRef = adminDb.collection("therapists").doc(therapistId);
    await docRef.update({ active });

    logger.info("THERAPIST_MUTATION", "Therapist active status updated successfully", {
      therapistId,
      active,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logger.error("THERAPIST_MUTATION", "Failed to update therapist active status", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
