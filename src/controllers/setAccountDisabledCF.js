const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.checkUserBans = functions.pubsub
  .schedule("every Saturday 21:00") // 3 PM CST / 4 PM CDT
  .timeZone("America/Chicago")
  .onRun(async (context) => {
    const db = admin.firestore();
    const usersRef = db.collection("users");

    // Fetch only users who have at least 3 no-show strikes
    const snapshot = await usersRef.where("noShowStrikes", ">=", 3).get();

    let batch = db.batch();
    let bannedUsers = [];

    snapshot.forEach((doc) => {
      const userId = doc.id;
      const userData = doc.data();
      const timesConnected = userData.times_connected || 0;
      const noShowStrikes = userData.noShowStrikes || 0;

      let shouldBan = false;

      // If the user has NEVER connected but has 3+ no-show strikes, ban immediately
      if (timesConnected === 0) {
        shouldBan = true;
      } else {
        // Otherwise, apply the 25% no-show ratio rule
        const ratio = noShowStrikes / timesConnected;
        if (ratio > 0.25) {
          shouldBan = true;
        }
      }

      if (shouldBan) {
        batch.update(doc.ref, { account_disabled: true });

        // Store user details for logging
        bannedUsers.push({
          userId,
          noShowStrikes,
          timesConnected,
          ratio: timesConnected > 0 ? noShowStrikes / timesConnected : "N/A"
        });
      }
    });

    // Commit batch update (Firestore allows 500 writes per batch)
    if (bannedUsers.length > 0) {
      await batch.commit();
      console.log(JSON.stringify({
        level: "info",
        event: "users_banned",
        count: bannedUsers.length,
        users: bannedUsers
      }));
    } else {
      console.log(JSON.stringify({
        level: "info",
        event: "no_bans",
        message: "No accounts needed to be disabled."
      }));
    }

    return null;
  });