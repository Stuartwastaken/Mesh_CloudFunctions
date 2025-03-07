import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const reportUser = functions.firestore
    .document("account_strikes_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
    // Extract authUid and otherUid, ensuring they exist
      const authUid = snapshot.data().authUid?.id;
      const otherUid = snapshot.data().otherUid?.id;

      // Log the start of the function with user info
      functions.logger.log({
        message: "Starting reportUser function",
        authUid: authUid,
        otherUid: otherUid,
        docId: context.params.doc,
      });

      // Validate that both authUid and otherUid are present
      if (!authUid || !otherUid) {
        functions.logger.error({
          message: "Missing authUid or otherUid in the report document",
          authUid: authUid,
          otherUid: otherUid,
          docId: context.params.doc,
        });
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Missing authUid or otherUid in the report document."
        );
      }

      // Extract report fields with default values to avoid undefined
      const extremelyStrange: boolean = snapshot.data().extremely_strange ?? false;
      const harassment: boolean = snapshot.data().harassment ?? false;
      const quiteRude: boolean = snapshot.data().quite_rude ?? false;

      // Log the extracted report details
      functions.logger.log({
        message: "Extracted report details",
        authUid: authUid,
        otherUid: otherUid,
        extremelyStrange: extremelyStrange,
        harassment: harassment,
        quiteRude: quiteRude,
        docId: context.params.doc,
      });

      // Check if the user is reporting themselves
      if (authUid === otherUid) {
        functions.logger.warn({
          message: "User attempted to report themselves",
          authUid: authUid,
          otherUid: otherUid,
          docId: context.params.doc,
        });
        throw new functions.https.HttpsError(
            "unauthenticated",
            "You cannot report yourself."
        );
      }

      // Query and write to Firestore with error handling
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
                harassment: harassment,
                extremely_strange: extremelyStrange,
                quite_rude: quiteRude,
                comments: "",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });

          // Log success
          functions.logger.info({
            message: "Successfully created report",
            authUid: authUid,
            otherUid: otherUid,
            docId: context.params.doc,
          });
        } else {
        // Log if the report already exists
          functions.logger.info({
            message: "Report already exists, skipping creation",
            authUid: authUid,
            otherUid: otherUid,
            docId: context.params.doc,
          });
        }
      } catch (error: any) {
      // Log the error with details
        functions.logger.error({
          message: "Error in reportUser function",
          error: error.message,
          authUid: authUid,
          otherUid: otherUid,
          docId: context.params.doc,
          stack: error.stack,
        });
        throw new functions.https.HttpsError(
            "internal",
            "An error occurred while processing the report."
        );
      }
    });
