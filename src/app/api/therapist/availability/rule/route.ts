import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { checkTherapistAccess } from "../../_lib/authCheck";
import { logger } from "../../../_lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { therapistId, rule } = body;

    if (!therapistId || !rule) {
      return NextResponse.json({ error: "Missing therapistId or rule data" }, { status: 400 });
    }

    // Verify authentication and authorization (admin, or therapist ownership)
    const checkResult = await checkTherapistAccess(request, therapistId, "SAVE_AVAILABILITY_RULE");
    if (!checkResult.authorized) {
      return checkResult.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Save with adminDb
    const collectionRef = adminDb.collection(`therapistAvailability/${therapistId}/recurringRules`);
    const docRef = await collectionRef.add(rule);

    logger.info("THERAPIST_MUTATION", "Availability rule saved successfully", {
      therapistId,
      ruleId: docRef.id,
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (err: unknown) {
    logger.error("THERAPIST_MUTATION", "Failed to save availability rule", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get("therapistId");
    const ruleId = searchParams.get("ruleId");

    if (!therapistId || !ruleId) {
      return NextResponse.json({ error: "Missing therapistId or ruleId parameters" }, { status: 400 });
    }

    // Verify authentication and authorization (admin, or therapist ownership)
    const checkResult = await checkTherapistAccess(request, therapistId, "DELETE_AVAILABILITY_RULE");
    if (!checkResult.authorized) {
      return checkResult.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete with adminDb
    const docRef = adminDb.doc(`therapistAvailability/${therapistId}/recurringRules/${ruleId}`);
    await docRef.delete();

    logger.info("THERAPIST_MUTATION", "Availability rule deleted successfully", {
      therapistId,
      ruleId,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logger.error("THERAPIST_MUTATION", "Failed to delete availability rule", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
