# Saarthi Firestore Rules Architecture Audit & Rewrite

## 1. Vulnerability Analysis of Old Rules

### A. Privilege Escalation via the Users Collection
**Flaw:** The previous rule for `/users/{userId}` was:
```javascript
allow write: if isAdmin(); // Note: This had a comment hinting at a bootstrap backdoor.
```
While it checked `isAdmin()`, the `isAdmin()` function itself relied on checking the `role` field inside the user's document. If a developer temporarily changed the rule to `allow write: if isSignedIn();` to test something, any user could update their own document to `{ role: "admin" }` and gain full system control forever.
**Fix:** The new rules explicitly lock down the `users` collection. Writes to the `users` collection (such as setting roles) must **never** be done client-side. They must be handled by Firebase Admin via a Server Action or API route upon user creation or by an existing admin from a secure dashboard.

### B. Malicious Slot Locking (Denial-of-Service)
**Flaw:** The old `/locked_slots/{slotId}` rule allowed unauthenticated users to create locks *without* requiring an `expiresAt` timestamp:
```javascript
(!('expiresAt' in request.resource.data) || request.resource.data.expiresAt is timestamp);
```
An attacker could write a script to generate thousands of lock documents for every therapist, omitting the `expiresAt` field. This would permanently block all availability on the platform.
**Fix:** The new rule requires strict field matching using `hasOnlyKeys`. It forces `expiresAt` to be present, requires it to be a valid timestamp, and explicitly bounds it to a maximum of 15 minutes into the future:
```javascript
request.resource.data.expiresAt <= request.time + duration.value(15, 'm');
```

### C. Public Booking Creation Injection
**Flaw:** The old `/bookings/{bookingId}` rule used `hasAll()`, meaning the document had to contain the required fields, but an attacker could add *any other fields they wanted*. They could inject `{ "price": 0, "status": "confirmed" }`.
**Fix:** Introduced the `hasOnlyKeys(allowedKeys)` helper function. This guarantees that *only* the expected fields are written to the database from the client.

### D. Contact Form Spam
**Flaw:** Unauthenticated creation of contact documents lacked strict type validation and allowed additional fields.
**Fix:** Applied `hasOnlyKeys()`, added regex validation for the email, and enforced character limits on the message to prevent large payload injection (billing attacks). Note: For true spam protection, you must implement a CAPTCHA and move this to a Server Action/API route with rate limiting (Upstash Redis).

---

## 2. Architecture Guidelines

### TherapistId vs. Auth.uid Mapping
Therapists have a public `therapistId` (the document ID in the `therapists` collection) and a private `authId` (their Firebase Authentication UID).
1. The `users` collection is keyed by `auth.uid`. It stores the role (`therapist`).
2. The `therapists` collection is keyed by a unique `therapistId` (e.g., `dr-dravina-123`). Inside this document is `authId: "uid_from_firebase_auth"`.
3. When a therapist requests their bookings, the rule `isTherapistDocOwner(therapistId)` looks up the therapist document, checks its `authId`, and compares it to the `request.auth.uid`.

### Structuring `recurringRules` and `overrides` (Nested Collections)
Your new structure is:
* `therapistAvailability/{therapistId}/recurringRules/{ruleId}`
* `therapistAvailability/{therapistId}/overrides/{overrideId}`

**Why this is safe:**
The new rules use `match /therapistAvailability/{therapistId}` as a parent scope. The nested `match` blocks inherit the `therapistId` wildcard. The rules invoke `isTherapistDocOwner(therapistId)` ensuring that only the specific therapist linked to that ID can write to their rules and overrides. Clients can read these publically to generate the calendar UI.

### Securing Bookings and Slot Reservations
While the new rules are highly secure for client-side writes, **the best practice is to move bookings and slot reservations entirely to the server**.
1. **Client Action:** User selects a slot and clicks "Book". Next.js calls a Server Action.
2. **Server Action:** Uses Firebase Admin SDK (which bypasses security rules entirely).
3. **Admin SDK Logic:** The server checks `locked_slots` and `bookings`. If clear, it uses an Admin SDK transaction to lock the slot and create the booking simultaneously.
4. **Result:** No client-side rules are needed for booking creation, reducing your attack surface to zero.

### Scalability and Indexes
To support these rules and the dashboard, you must configure composite indexes in `firebase.json`:
1. **Bookings Index:** `therapistId` (ASC), `date` (ASC), `status` (ASC) - Allows therapists to view upcoming pending bookings.
2. **TTL on Locked Slots:** You **must** create a Time-to-Live (TTL) index in the Google Cloud Console for the `locked_slots` collection on the `expiresAt` field. This tells Firestore to automatically delete the lock document when the timestamp passes, fixing concurrency issues.