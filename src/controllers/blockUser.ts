import * as functions from "firebase-functions";

export const blockUser = functions.firestore
    .document("block_user_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const authUidDocRef = snapshot
          .data()?.authUid as FirebaseFirestore.DocumentReference;
      const otherUidDocRef = snapshot
          .data()?.otherUid as FirebaseFirestore.DocumentReference;

      if (!authUidDocRef || !otherUidDocRef) {
        console.warn("Missing authUid or otherUid.");
        return null;
      }

      const authUidBlockedRef = authUidDocRef.collection("blocked").doc();
      const otherUidBlockedRef = otherUidDocRef.collection("blocked").doc();

      // Set blocked document for authUid user
      await authUidBlockedRef.set({
        uid: otherUidDocRef,
        blocked_by_uid: authUidDocRef,
      });

      // Set blocked document for otherUid user
      await otherUidBlockedRef.set({
        uid: authUidDocRef,
        blocked_by_uid: authUidDocRef,
      });

      console.log(`Blocked relationship created between 
      ${authUidDocRef.path} and ${otherUidDocRef.path}.`);
      return null;
    });

