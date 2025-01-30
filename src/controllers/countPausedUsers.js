const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.countPausedUsers = functions.pubsub
    .schedule("every 72 hours")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      try {
      // 1. Get all active cities
        const activeCitiesSnapshot = await db
            .collection("city_config")
            .where("isActive", "==", true)
            .get();
        const activeCities = activeCitiesSnapshot.docs.map(
            (doc) => doc.data().city
        );

        // 2. Find all users in those cities
        const usersSnapshot = await db
            .collection("users")
            .where("current_city", "in", activeCities)
            .get();

        // We'll collect counts in a lookup object:
        // {
        //   [cityName]: { countTrue: number, countFalse: number, countNull: number, total: number }
        // }
        const cityStats = {};

        usersSnapshot.forEach((doc) => {
          const user = doc.data();
          const city = user.current_city;

          // Initialize counts if we haven't seen this city yet
          if (!cityStats[city]) {
            cityStats[city] = {
              countTrue: 0,
              countFalse: 0,
              countNull: 0,
              total: 0,
            };
          }
          cityStats[city].total++;

          // Count pause_invites by city
          if (Object.prototype.hasOwnProperty.call(user, "pause_invites")) {
            if (user.pause_invites === true) {
              cityStats[city].countTrue++;
            } else {
              cityStats[city].countFalse++;
            }
          } else {
            cityStats[city].countNull++;
          }
        });

        // 3. Log the results for each city
        console.log(`Active cities: ${activeCities.join(", ")}`);
        for (const cityName of Object.keys(cityStats)) {
          const stats = cityStats[cityName];
          console.log(
              `City: ${cityName}  |  total: ${stats.total}  |  pause_invites true: ${stats.countTrue}` +
            `  |  pause_invites false: ${stats.countFalse}  |  pause_invites null/missing: ${stats.countNull}`
          );
        }
      } catch (error) {
        console.error("Error in scheduledCheckPauseInvites:", error);
      }
    });
