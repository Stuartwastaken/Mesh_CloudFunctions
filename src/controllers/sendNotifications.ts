import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

/**
 * Interface for FCM token data.
 * @interface
 */
interface FCMTokenData {
  device_type: string;
  fcm_token: string;
}

/**
 * Send a push notification to a specific user.
 * @async
 * @function
 * @param {string} userId - The user ID.
 * @param {string} message - The message to send in the push notification.
 * @return {Promise<void>}
 */
export async function notifyUser(userId: string,
    message: string): Promise<void> {
  const fcmTokensSnapshot = await admin
      .firestore()
      .collection("user")
      .doc(userId)
      .collection("fcm_tokens")
      .get();

  // Loop through all FCM tokens
  for (const doc of fcmTokensSnapshot.docs) {
    const fcmTokenData: FCMTokenData = doc.data() as FCMTokenData;

    if (fcmTokenData && fcmTokenData.fcm_token) {
      const payload = {
        notification: {
          title: "Location update",
          body: message,
        },
        token: fcmTokenData.fcm_token,
      };

      await admin.messaging().send(payload);
    }
  }
}

/**
 * Cloud Function to send a notification to a specific user.
 * @async
 * @function
 * @param {Object} data - Data received from the function call.
 * @param {string} data.userId - The user ID.
 * @param {functions.https.CallableContext} context - The Cloud Function context
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const sendNotification = functions.https.onCall(
    async (
        data: { userId: string },
        context: functions.https.CallableContext
    ): Promise<{ success: boolean; message: string }> => {
    // Retrieve user ID from the function call data
      const userId: string = data.userId;
      const message =
      "Your liked locations are not open today. Please choose other locations.";

      if (userId) {
        await notifyUser(userId, message);
        return {success: true, message: "Notification sent."};
      } else {
        return {success: false, message: "User ID not provided."};
      }
    }
);

