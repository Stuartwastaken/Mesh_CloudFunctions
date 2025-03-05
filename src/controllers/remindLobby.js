const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * Sends a notification to a user via their FCM tokens.
 * @param {string} userId - The ID of the user to notify.
 * @param {Object} messageObj - The notification message with title and body.
 */
async function notifyUser(userId, messageObj) {
  const fcmTokensSnapshot = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .collection("fcm_tokens")
      .get();

  if (fcmTokensSnapshot.empty) {
    console.log(`[WARNING] No FCM tokens found for user ${userId}`);
    return;
  }

  for (const doc of fcmTokensSnapshot.docs) {
    const fcmTokenData = doc.data();
    if (fcmTokenData && fcmTokenData.fcm_token) {
      const payload = {
        notification: {
          title: messageObj.title,
          body: messageObj.body,
        },
        token: fcmTokenData.fcm_token,
      };

      try {
        await admin.messaging().send(payload);
        console.log(`[SUCCESS] Notification sent to user ${userId}`);
      } catch (error) {
        console.error(
            `[ERROR] Failed to send notification to ${userId}:`,
            error.message
        );
      }
    }
  }
}

/**
 * Cloud Function triggered when a document is created in 'remind_lobby_tempbin'.
 * Sends notifications to users with the 'name' from their 'location' document.
 */
exports.remindLobby = functions.firestore
    .document("remind_lobby_tempbin/{docId}")
    .onCreate(async (snap, context) => {
    // Extract the city from the newly created document
      const reminderData = snap.data();
      const city = reminderData.city;

      if (!city) {
        console.error(
            "[ERROR] City field is missing in the remind_lobby_tempbin document"
        );
        return;
      }

      console.log(`[START] Processing notifications for city: ${city}`);

      // Step 1: Query users where 'current_city' matches the city
      const usersSnapshot = await db
          .collection("users")
          .where("current_city", "==", city)
          .where("searching", "==", true) // Added to filter users who are actively searching
          .get();

      if (usersSnapshot.empty) {
        console.log(`[WARNING] No users found with current_city ${city}`);
        return;
      }

      console.log(`Number of users found: ${usersSnapshot.size}`);

      // Step 2: Collect unique location references and map users to locations
      const locationPathsSet = new Set(); // For unique location paths
      const userLocationMap = {}; // Maps userId to their location path

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const locationRef = userDoc.get("location");
        if (locationRef && locationRef.path) {
          locationPathsSet.add(locationRef.path);
          userLocationMap[userId] = locationRef.path;
        } else {
          console.log(`[WARNING] User ${userId} has no valid location reference`);
        }
      }

      if (locationPathsSet.size === 0) {
        console.log("[WARNING] No location references found for users");
        return;
      }

      // Step 3: Convert unique location paths to DocumentReferences and fetch them
      const uniqueLocationRefs = Array.from(locationPathsSet).map((path) =>
        db.doc(path)
      );
      const locationDocs = await Promise.all(
          uniqueLocationRefs.map((ref) => ref.get())
      );

      // Step 4: Create a map from location path to location name
      const locationNameMap = {};
      for (const locDoc of locationDocs) {
        if (locDoc.exists) {
          const name = locDoc.get("name");
          if (name) {
            locationNameMap[locDoc.ref.path] = name;
          } else {
            console.log(
                `[WARNING] Location ${locDoc.ref.path} has no 'name' field`
            );
          }
        } else {
          console.log(
              `[WARNING] Location document does not exist: ${locDoc.ref.path}`
          );
        }
      }

      // Step 5: Send notifications to each user with their location name
      for (const userId in userLocationMap) {
        if (Object.prototype.hasOwnProperty.call(userLocationMap, userId)) {
          const locationPath = userLocationMap[userId];
          const locationName = locationNameMap[locationPath];
          if (locationName) {
            const messageObj = {
              title: "Mesh Reminder",
              body: `You are all set to go out to ${locationName} this Friday!`,
            };
            await notifyUser(userId, messageObj);
          } else {
            console.log(
                `[WARNING] No location name for user ${userId} at ${locationPath}`
            );
          }
        }
      }
      console.log(`[FINISH] Finished processing notifications for city: ${city}`);
    });
