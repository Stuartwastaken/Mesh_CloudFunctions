const functions = require("firebase-functions");
const admin = require("firebase-admin");


exports.scheduledFridayReminder = functions.pubsub
    .schedule("0 17 * * 5")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      try {
      // Get a reference to the Firestore database
        const db = admin.firestore();

        // Create a new document with a unique ID in the "remind_lobby_tempbin" collection
        const docRef = await db.collection("remind_lobby_tempbin").add({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log("Blank document written with ID: ", docRef.id);
        return null;
      } catch (error) {
        console.error("Error writing document: ", error);
        throw new Error("Failed to write document");
      }
    });
