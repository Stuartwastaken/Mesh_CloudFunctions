const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

exports.checkClosedLocations = functions.pubsub.schedule("every saturday 10:00")
    .timeZone("America/Chicago") // Adjust as needed
    .onRun(async (context) => {
      const date = new Date().toLocaleDateString("en-US", {month: "numeric", day: "numeric", year: "numeric"}).replace(/\//g, "_");
      const now = admin.firestore.Timestamp.now();
      const db = admin.firestore();
      // Find closed locations for this date
      const closedLocationsQuery = db.collection("active_locations")
          .where("expirationDate", "<=", now)
          .where("isActive", "==", true);
      const closedLocationsSnapshot = await closedLocationsQuery.get();

      for (const doc of closedLocationsSnapshot.docs) {
        const currentLocationId = doc.id;
        try {
          const response = await axios.get(
              "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/utilityMoveUsers",
              {params: {date, currentLocationId}}
          );
          const {newLocationId} = response.data;
          if (newLocationId) {
          // Fetch users moved (for notification)
            const usersSnapshot = await db.collectionGroup("YOUR_CITY_SUBCOLLECTION_NAME")
                .where("locationId", "==", newLocationId)
                .get();
            const userIds = usersSnapshot.docs.map((doc) => doc.id);
            // TODO: Implement notification logic (e.g., text/push) for userIds
            console.log(`Moved users from ${currentLocationId} to ${newLocationId} and notified:`, userIds);
          }
        } catch (error) {
          console.error(`Error moving users from ${currentLocationId}:`, error);
        }
      }
    });
