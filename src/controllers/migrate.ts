import * as functions from "firebase-functions";
import * as admin from "firebase-admin";


/**
 * This function listens to the creation of documents in the
 * "change_referral_collection_tempbin" collection and converts
 * boolean 'used' fields in the "referrals" collection to integer (0 or 1).
 */
export const migrateUsedFieldToInt = functions.firestore
    .document("change_referral_collection_tempbin/{docId}")
    .onCreate(async (snapshot, context) => {
      console.log("[MIGRATION] Starting boolean->int migration for referrals.");

      try {
        const referralsColl = admin.firestore().collection("referrals");
        const allReferrals = await referralsColl.get();

        // Batch updates to avoid hitting transaction limits
        let batch = admin.firestore().batch();
        let opsCount = 0;

        allReferrals.forEach((docSnap) => {
          const data = docSnap.data();
          if (typeof data.used === "boolean") {
          // Convert to 0 or 1
            const newVal = data.used ? 1 : 0;
            batch.update(docSnap.ref, {used: newVal});
            opsCount++;

            // Commit batch in chunks if needed (here we do it every 400 to stay safe under 500 limit)
            if (opsCount >= 400) {
              batch.commit();
              batch = admin.firestore().batch();
              opsCount = 0;
            }
          }
        });

        // Commit leftover batch if any
        if (opsCount > 0) {
          await batch.commit();
        }

        console.log("[MIGRATION] Migration complete.");
        return true;
      } catch (err) {
        console.error("[MIGRATION] Error during migration:", err);
        return false;
      }
    });
