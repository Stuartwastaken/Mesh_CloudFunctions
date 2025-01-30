const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Don't call admin.initializeApp() here if it's already initialized in your index.js

exports.checkActiveUserStatus = functions.https.onCall(async (data, context) => {
  try {
    const db = admin.firestore();
    const currentDate = new Date();
    const threeMonthsAgo = new Date(currentDate);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // 1. Find active cities
    const activeCitiesSnapshot = await db
        .collection("city_config")
        .where("isActive", "==", true)
        .get();
    const activeCities = activeCitiesSnapshot.docs.map((doc) => doc.data().city);

    // 2. Get all users for these cities
    const usersSnapshot = await db
        .collection("users")
        .where("current_city", "in", activeCities)
        .get();

    const pausedUserPhones = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();

      // Extract the user's lobby_ref, if it exists
      let lobbyRef = userData.lobby_ref;

      let shouldPause = false;

      // (a) If there's no lobby_ref, set pause_invites = false
      if (!lobbyRef) {
        shouldPause = false;
      } else {
        // (b) If there's a lobby_ref, parse out a date
        //    Depending on how it's stored, you might need different parsing logic.
        //    Below is an example if your coworker stored something like "lobby/08_01_2024" in that field.
        if (typeof lobbyRef === "object" && lobbyRef._path) {
          // Extract path if it's a DocumentReference
          lobbyRef = lobbyRef.path;
        }

        if (typeof lobbyRef === "string" && lobbyRef.includes("/")) {
          // Example: "lobby/08_01_2024"
          const parts = lobbyRef.split("/");
          if (parts.length > 1) {
            const rawDateStr = parts[1]; // "08_01_2024"
            const [mm, dd, yyyy] = rawDateStr.split("_");
            const lobbyDate = new Date(`${yyyy}-${mm}-${dd}`);

            if (isNaN(lobbyDate.getTime())) {
              console.error(`Couldn't parse date from lobby_ref for user ${userDoc.id}: ${lobbyRef}`);
            } else {
              // If it's older than 3 months, set pause_invites = true
              if (lobbyDate < threeMonthsAgo) {
                shouldPause = true;
              } else {
                shouldPause = false;
              }
            }
          } else {
            console.error(`Malformed lobby_ref for user ${userDoc.id}: ${lobbyRef}`);
          }
        } else {
          console.error(`Invalid or unrecognized lobby_ref for user ${userDoc.id}: ${JSON.stringify(lobbyRef)}`);
        }
      }

      // Update if there's a change
      if (shouldPause !== userData.pause_invites) {
        await userDoc.ref.update({pause_invites: shouldPause});
        // Collect phone numbers only when newly paused
        if (shouldPause && userData.phone_number) {
          pausedUserPhones.push(userData.phone_number);
        }
      }
    }

    // If any were newly paused, store them in your tempbin
    if (pausedUserPhones.length > 0) {
      await db.collection("send_active_user_status_tempbin").add({
        phone_number: pausedUserPhones,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      success: true,
      message: "Active user status checked and updated successfully.",
    };
  } catch (error) {
    console.error("Error checking active user status:", error);
    throw new functions.https.HttpsError("internal", "Failed to check active user status.");
  }
});
