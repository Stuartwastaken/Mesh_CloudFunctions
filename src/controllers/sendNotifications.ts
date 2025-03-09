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
      .collection("users")
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

  let successCount = 0;
  let failureCount = 0;

  for (const token of tokens) {
    const message = {
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
    };

    try {
      await admin.messaging().send(message);
      successCount++;
      functions.logger.info("FCM Notification Sent", {
        userId,
        token,
      });
    } catch (error) {
      failureCount++;
      functions.logger.error("Failure sending notification to token", {
        userId,
        token,
        error: (error as Error).message || "Unknown error",
      });
    }
  }

  if (failureCount > 0) {
    functions.logger.warn("Some notifications failed", {
      userId,
      successCount,
      failureCount,
    });
    // Optionally throw an error if all notifications fail
    if (successCount === 0) {
      throw new Error(`Failed to send all notifications for user ${userId}`);
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
