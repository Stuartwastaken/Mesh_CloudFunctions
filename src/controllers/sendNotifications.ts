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
 * Interface for notification message with optional data.
 * @interface
 */
interface NotificationMessage {
  title: string;
  body: string;
  data?: { [key: string]: string }; // Optional custom data
}

/**
 * Send a push notification to a specific user.
 * @async
 * @function
 * @param {string} userId - The user ID.
 * @param {NotificationMessage} messageObj - The notification message.
 * @return {Promise<void>}
 */
export async function notifyUser(userId: string, messageObj: NotificationMessage): Promise<void> {
  const db = admin.firestore();
  const fcmTokensSnapshot = await db
      .collection("users") // Corrected path
      .doc(userId)
      .collection("fcm_tokens")
      .get();

  const tokens = fcmTokensSnapshot.docs
      .map((doc) => doc.data() as FCMTokenData)
      .filter((data) => data && data.fcm_token)
      .map((data) => data.fcm_token);

  if (tokens.length === 0) {
    functions.logger.warn("No FCM tokens found for user", {userId});
    return;
  }

  const messages = tokens.map((token) => ({
    notification: {
      title: messageObj.title,
      body: messageObj.body,
    },
    data: messageObj.data || {},
    android: {
      notification: {sound: "default"},
    },
    apns: {
      payload: {aps: {sound: "default"}},
    },
    token,
  }));

  try {
    const response = await admin.messaging().sendAll(messages);
    functions.logger.info("FCM Notifications Sent", {
      userId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          functions.logger.error("Failure sending notification to token", {
            userId,
            token: tokens[idx],
            error: resp.error?.message || "Unknown error",
          });
        }
      });
    }
  } catch (error) {
    functions.logger.error("Error sending notifications", {
      userId,
      error: (error as Error).message,
    });
    throw error; // Re-throw to allow caller to handle
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
      const userId: string = data.userId;
      const message: NotificationMessage = {
        title: "You have been unqueued.",
        body: "Your liked locations are not open today. Please choose other locations.",
      };

      if (userId) {
        await notifyUser(userId, message);
        return {success: true, message: "Notification sent."};
      } else {
        return {success: false, message: "User ID not provided."};
      }
    }
);
