import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const reportUser = functions.firestore
    .document("account_strikes_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      // Extract authUid and otherUid
      const authUid = snapshot.data().authUid?.id;
      const otherUid = snapshot.data().otherUid?.id;
      const response: string = snapshot.data().response || "";

      // Log the start of the function
      functions.logger.log("Starting reportUser function", {
        authUid,
        otherUid,
        docId: context.params.doc,
        response,
      });

      // Validate that both authUid and otherUid are present
      if (!authUid || !otherUid) {
        functions.logger.error("Missing authUid or otherUid in the report document", {
          authUid,
          otherUid,
          docId: context.params.doc,
        });
        throw new functions.https.HttpsError("invalid-argument", "Missing authUid or otherUid in the report document.");
      }

      // Convert response string into boolean flags
      const harassment = response === "Harassment";
      const didnt_get_along = response === "Didn't get along";
      const extremely_strange = response === "Extremely Strange";
      const quite_rude = response === "Quite Rude";
      const talked_too_much = response === "Talked too much";

      // Log extracted details
      functions.logger.log("Extracted report details", {
        authUid,
        otherUid,
        report_reason: response,
        details: {
          harassment,
          extremely_strange,
          didnt_get_along,
          quite_rude,
          talked_too_much,
        },
        docId: context.params.doc,
      });

      // Prevent users from reporting themselves
      if (authUid === otherUid) {
        functions.logger.warn("User attempted to report themselves", {
          authUid,
          otherUid,
          docId: context.params.doc,
        });
        throw new functions.https.HttpsError("unauthenticated", "You cannot report yourself.");
      }

      // Query and write to Firestore
      try {
        const otherUsersReports = await admin
            .firestore()
            .collection(`users/${otherUid}/account_strikes`)
            .doc(authUid)
            .get();

        if (!otherUsersReports.exists) {
          await admin
              .firestore()
              .collection(`users/${otherUid}/account_strikes`)
              .doc(authUid)
              .set({
                harassment,
                extremely_strange,
                didnt_get_along,
                quite_rude,
                talked_too_much,
                comments: "",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });

          functions.logger.info("Successfully created report", {
            authUid,
            otherUid,
            docId: context.params.doc,
          });
        } else {
          functions.logger.info("Report already exists, skipping creation", {
            authUid,
            otherUid,
            docId: context.params.doc,
          });
        }
      } catch (error: any) {
        functions.logger.error("Error in reportUser function", {
          error: error.message,
          authUid,
          otherUid,
          docId: context.params.doc,
          stack: error.stack,
        });
        throw new functions.https.HttpsError("internal", "An error occurred while processing the report.");
      }
    });
