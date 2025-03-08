import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp();
}

export const blockUser = functions.firestore
    .document("block_user_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const authUidDocRef = snapshot.data()?.authUid as FirebaseFirestore.DocumentReference;
      const otherUidDocRef = snapshot.data()?.otherUid as FirebaseFirestore.DocumentReference;

      // Validate required fields
      if (!authUidDocRef || !otherUidDocRef) {
        functions.logger.warn({
          message: "Missing authUid or otherUid",
          authUid: authUidDocRef?.path,
          otherUid: otherUidDocRef?.path,
          docId: context.params.doc,
          timestamp: new Date().toISOString(),
        });
        return null;
      }

      const authUidBlockedRef = authUidDocRef.collection("blocked").doc();

      // Set blocked document for authUid user (authUid blocks otherUid)
      await authUidBlockedRef.set({
        uid: otherUidDocRef,
        blocked_by_uid: authUidDocRef,
        blockedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info({
        message: "Blocked relationship created",
        authUid: authUidDocRef.path,
        otherUid: otherUidDocRef.path,
        blockedDocId: authUidBlockedRef.id,
        timestamp: new Date().toISOString(),
      });

      return null;
    });
