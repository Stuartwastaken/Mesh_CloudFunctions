const functions = require("firebase-functions");
const admin = require("firebase-admin");
const moment = require("moment-timezone");

function getNextSaturday() {
  const today = new Date();
  return new Date(today
      .setDate(today.getDate() + ((6 - today.getDay() + 7) % 7)));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}_${day}_${year}`;
}

exports.joinLobby = functions.firestore
    .document("join_lobby_tempbin/{docId}")
    .onCreate(async (snapshot, context) => {
      const now = moment().tz("America/Chicago").format();
      const nextSaturday = formatDate(getNextSaturday());
      const data = snapshot.data();

      if (!data || !data.uid || data.uid.length === 0) {
        console.error("No data found in snapshot or UID list is empty.");
        return null;
      }

      const userRef = data.uid[0];
      if (!userRef) {
        console.error(`First UID is undefined or 
              not a Firestore Document Reference.`);
        return null;
      }

      const userId = userRef.id;

      const lobbyDocRef = admin.firestore()
          .collection("lobby").doc(nextSaturday)
          .collection(data.city || "madison_wi").doc(userId);

      const newDocData = {
        age: data.age,
        name: data.name,
        sex: data.sex,
        location: data.location,
        uid: userId,
        createdAt: now,
        testing: data.testing || false,
        city: data.city || "madison_wi",
      };

      try {
        await lobbyDocRef.set(newDocData);
        console.log(`Successfully created lobby document for UID: ${userId}`);
      } catch (error) {
        console.error("Error writing lobby document:", error);
        return null;
      }

      if (userId) {
        const usersDocRef = admin.firestore()
            .collection("users").doc(userId);
        try {
          if (data.location instanceof admin.firestore.DocumentReference) {
            await usersDocRef.set({
              searching: true,
              location: data.location,
              lobby_ref: lobbyDocRef,
            }, {merge: true});
            console.log(`Updated user document for UID:
                       ${userId} with searching status and lobby reference.`);
          } else {
            console.error("Invalid location path provided:", data.location);
          }
        } catch (error) {
          console.log("this is my userId: ", userId);
          console.error("Error updating user document:", error);
        }
      } else {
        console.error("UID is undefined or null, cannot update user document.");
      }

      return null;
    });
