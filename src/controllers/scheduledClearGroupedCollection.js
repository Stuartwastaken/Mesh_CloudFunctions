const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

exports.scheduledClearGroupedCollection = functions.pubsub
    .schedule("0 12 * * 0")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const db = admin.firestore();
      const groupedRef = db.collection("grouped");

      try {
        const snapshot = await groupedRef.get();
        const batch = db.batch();
        let deleteCount = 0;

        snapshot.forEach((doc) => {
          const docId = doc.id;
          // Regex to match date format like "6_29_2024"
          const dateRegex = /^\d{1,2}_\d{1,2}_\d{4}$/;

          if (!dateRegex.test(docId)) {
            batch.delete(doc.ref);
            deleteCount++;
          }
        });

        await batch.commit();
        console.log(`Deleted ${deleteCount} documents from 'grouped' collection.`);
        return null;
      } catch (error) {
        console.error("Error clearing grouped collection:", error);
        throw new Error("Failed to clear grouped collection");
      }
    });
