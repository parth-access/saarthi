import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { checkTherapistAccess } from "../../_lib/authCheck";
import { logger } from "../../../_lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { therapistId, override } = body;

    if (!therapistId || !override) {
      return NextResponse.json({ error: "Missing therapistId or override data" }, { status: 400 });
    }

    // Verify authentication and authorization (admin, or therapist ownership)
    const checkResult = await checkTherapistAccess(request, therapistId, "SAVE_OVERRIDE");
    if (!checkResult.authorized) {
      return checkResult.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Save with adminDb
    const collectionRef = adminDb.collection(`therapistAvailability/${therapistId}/overrides`);
    const docRef = await collectionRef.add(override);

    logger.info("THERAPIST_MUTATION", "Availability override saved successfully", {
      therapistId,
      overrideId: docRef.id,
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (err: unknown) {
    logger.error("THERAPIST_MUTATION", "Failed to save availability override", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get("therapistId");
    const overrideId = searchParams.get("overrideId");

    if (!therapistId || !overrideId) {
      return NextResponse.json({ error: "Missing therapistId or overrideId parameters" }, { status: 400 });
    }

    // Verify authentication and authorization (admin, or therapist ownership)
    const checkResult = await checkTherapistAccess(request, therapistId, "DELETE_OVERRIDE");
    if (!checkResult.authorized) {
      return checkResult.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete with adminDb
    const docRef = adminDb.doc(`therapistAvailability/${therapistId}/overrides/${overrideId}`);
    await docRef.delete();

    logger.info("THERAPIST_MUTATION", "Availability override deleted successfully", {
      therapistId,
      overrideId,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logger.error("THERAPIST_MUTATION", "Failed to delete availability override", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
