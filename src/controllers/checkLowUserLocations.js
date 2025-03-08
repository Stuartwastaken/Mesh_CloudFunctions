const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Helper function to get the next Saturday
function getNextSaturday() {
  const today = new Date();
  if (today.getDay() === 6) {
    return today;
  } else {
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7));
    return nextSaturday;
  }
}

// Helper function to format the date as MM_DD_YYYY
function formatDate(date) {
  return `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`;
}

const db = admin.firestore();

exports.checkLowUserLocations = functions.pubsub.schedule("every 1 hours")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
    // Only run on Friday night (after 6 PM)
      const now = new Date();
      if (now.getDay() !== 5 || now.getHours() < 18) return;

      // Get the date string for this Saturday
      const saturday = getNextSaturday();
      const date = formatDate(saturday);

      // Get active cities from city_config
      const activeCitiesSnapshot = await db.collection("city_config")
          .where("isActive", "==", true)
          .get();

      // Get all users for the date and group by locationId for each active city
      const locationUserCounts = {};

      // For each active city, check their users in the lobby
      for (const cityDoc of activeCitiesSnapshot.docs) {
        const cityId = cityDoc.id;
        const cityRef = db.collection("lobby").doc(date).collection(cityId);
        const usersSnapshot = await cityRef.get();

        usersSnapshot.docs.forEach((doc) => {
          const locationId = doc.data().locationId;
          locationUserCounts[locationId] = (locationUserCounts[locationId] || 0) + 1;
        });
      }

      // Find locations with 1 or 2 users and write to tempbin
      const batch = db.batch();
      for (const [currentLocationId, count] of Object.entries(locationUserCounts)) {
        if (count <= 2) {
          try {
          // Create a unique document ID for this move request
            const moveRequestId = `${date}_${currentLocationId}`;
            const tempbinRef = db.collection("utility_move_users_lobby_tempbin").doc(moveRequestId);

            batch.set(tempbinRef, {
              date,
              currentLocationId,
              userCount: count,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              status: "pending",
            });

            console.log(`Added move request to tempbin for location ${currentLocationId} with ${count} users`);
          } catch (error) {
            console.error(`Error writing to tempbin for location ${currentLocationId}:`, error);
          }
        }
      }

      // Commit all the tempbin writes in a single batch
      try {
        await batch.commit();
        console.log("Successfully wrote all move requests to tempbin");
      } catch (error) {
        console.error("Error committing batch writes to tempbin:", error);
      }
    });
