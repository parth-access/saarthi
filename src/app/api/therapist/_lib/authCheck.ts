import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { logger } from "../../_lib/logger";

export interface AuthCheckResult {
  authorized: boolean;
  uid?: string;
  role?: string;
  therapistId?: string;
  errorResponse?: Response;
}

export async function checkTherapistAccess(
  request: Request,
  targetTherapistId?: string,
  actionName: string = "MUTATION"
): Promise<AuthCheckResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("THERAPIST_AUTH", "Missing or invalid authorization header during mutation", { action: actionName });
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Missing or invalid token" },
        { status: 401 }
      ),
    };
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (!decodedToken) {
      logger.warn("THERAPIST_AUTH", "Invalid ID token", { action: actionName });
      return {
        authorized: false,
        errorResponse: NextResponse.json(
          { error: "Forbidden: Invalid token" },
          { status: 403 }
        ),
      };
    }

    const uid = decodedToken.uid;
    // Get user profile role from Firestore
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      logger.warn("THERAPIST_AUTH", "User profile not found in database", { uid, action: actionName });
      return {
        authorized: false,
        errorResponse: NextResponse.json(
          { error: "Forbidden: User profile not found" },
          { status: 403 }
        ),
      };
    }

    const role = userSnap.data()?.role;
    if (role === "admin") {
      logger.info("THERAPIST_AUTH", "Admin access granted", { uid, action: actionName });
      return { authorized: true, uid, role };
    }

    if (role === "therapist") {
      // Find the therapist document ID matching authId == uid
      const therapistQuery = await adminDb
        .collection("therapists")
        .where("authId", "==", uid)
        .limit(1)
        .get();

      if (therapistQuery.empty) {
        logger.warn("THERAPIST_AUTH", "Therapist profile not found for authenticated therapist role", { uid, action: actionName });
        return {
          authorized: false,
          errorResponse: NextResponse.json(
            { error: "Forbidden: Therapist profile not found" },
            { status: 403 }
          ),
        };
      }

      const therapistDocId = therapistQuery.docs[0].id;

      if (targetTherapistId && therapistDocId !== targetTherapistId) {
        logger.warn("THERAPIST_AUTH", "Therapist attempted unauthorized profile mutation", {
          uid,
          therapistId: therapistDocId,
          targetTherapistId,
          action: actionName,
        });
        return {
          authorized: false,
          errorResponse: NextResponse.json(
            { error: "Forbidden: You do not have permission to modify another therapist's settings" },
            { status: 403 }
          ),
        };
      }

      return { authorized: true, uid, role, therapistId: therapistDocId };
    }

    logger.warn("THERAPIST_AUTH", "Insufficient privileges", { uid, role, action: actionName });
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        { error: "Forbidden: Insufficient privileges" },
        { status: 403 }
      ),
    };
  } catch (err: unknown) {
    logger.error("THERAPIST_AUTH2", "Identity verification failed", err, { action: actionName });
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        { error: "Forbidden: Failed to verify identity", details: err instanceof Error ? err.message : String(err) },
        { status: 403 }
      ),
    };
  }
}
