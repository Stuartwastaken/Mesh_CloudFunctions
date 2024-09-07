const functions = require("firebase-functions");
const admin = require("firebase-admin");

exports.checkAndUpdateCityStatus = functions.pubsub
    .schedule("every 5 hours")
    .onRun(async (context) => {
      const db = admin.firestore();
      const cityConfigRef = db.collection("city_config");

      try {
      // Get all documents where isActive is false
        const snapshot = await cityConfigRef.where("isActive", "==", false).get();

        const batch = db.batch();
        let updateCount = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.totalUsers >= 500) {
          // If totalUsers is 500 or more, update isActive to true
            batch.update(doc.ref, {isActive: true});
            updateCount++;
          }
        });

        // Commit the batch
        await batch.commit();

        console.log(`Updated ${updateCount} cities to active status.`);
        return null;
      } catch (error) {
        console.error("Error updating city status:", error);
        return null;
      }
    });
