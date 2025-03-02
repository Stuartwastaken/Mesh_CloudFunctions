const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const kFcmTokensCollection = "fcm_tokens";

exports.checkUserBans = functions.pubsub
  .schedule("every Saturday 21:00") // 3 PM CST / 4 PM CDT
  .timeZone("America/Chicago")
  .onRun(async (context) => {
    try {
      let lastDoc = null;
      const bannedUsers = [];
      let batchCount = 0;

      do {
        let query = db.collection("users")
          .where("noShowStrikes", ">=", 3)
          .orderBy("noShowStrikes")
          .limit(500);

        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        const batch = db.batch();

        for (const doc of snapshot.docs) {
          const userId = doc.id;
          const userData = doc.data();
          const timesConnected = userData.times_connected || 0;
          const noShowStrikes = userData.noShowStrikes || 0;
          let shouldBan = false;

          if (timesConnected === 0 || (noShowStrikes / timesConnected > 0.25)) {
            shouldBan = true;
          }

          let userTokens = [];

          if (shouldBan) {
            batch.update(doc.ref, { account_disabled: true });
            bannedUsers.push({ userId, noShowStrikes, timesConnected });

            // Fetch FCM tokens only if user is banned
            const tokensSnapshot = await doc.ref.collection(kFcmTokensCollection).get();
            userTokens = tokensSnapshot.docs.map((doc) => doc.data().fcm_token).filter(Boolean);
          }
        }

        if (!snapshot.empty) lastDoc = snapshot.docs[snapshot.docs.length - 1];

        await batch.commit();
        batchCount++;
      } while (lastDoc);

      // Send FCM notifications in parallel
      const notificationPromises = bannedUsers.map(async (user) => {
        if (user.tokens && user.tokens.length > 0) {
          const message = {
            notification: {
              title: "Account Disabled",
              body: "Your account has been disabled due to multiple no-shows. Please contact Mesh support for assistance.",
            },
            data: { initialPageName: "SupportPage", parameterData: "{\"reason\":\"no_show_strikes\"}" },
            tokens: user.tokens,
          };

          try {
            return admin.messaging().sendEachForMulticast(message);
          } catch (error) {
            functions.logger.error("Error sending FCM notification", {
              userId: user.userId,
              error: error.toString()
            });
            return null;
          }
        }
        return null;
      });

      const fcmResponses = await Promise.all(notificationPromises);
      fcmResponses.forEach((response) => {
        if (response) {
          functions.logger.info("FCM Notification Sent", {
            successCount: response.successCount,
            failureCount: response.failureCount
          });
        }
      });

      functions.logger.info("User bans processed", {
        event: "users_banned",
        count: bannedUsers.length,
        batchCount,
        users: bannedUsers.map(u => ({
          userId: u.userId,
          noShowStrikes: u.noShowStrikes,
          timesConnected: u.timesConnected
        }))
      });
    } catch (error) {
      functions.logger.error("Error processing user bans", {
        error: error.toString()
      });
    }

    return null;
  });