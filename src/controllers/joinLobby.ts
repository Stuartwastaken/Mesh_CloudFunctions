import * as functions from "firebase-functions";
import * as admin from "firebase-admin";


export const joinLobby = functions.firestore
    .document("join_lobby_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const partyMembers = snapshot.data().party;
      const today = snapshot.data().today;

      if (today) {
        const lobbyTonightRef = admin.firestore().collection("lobby_tonight");
        const partyDocRef = lobbyTonightRef.doc();

        const batch = admin.firestore().batch();
        const userRef = admin.firestore().collection("user");
        const partyLocations = [];

        const userDoc = await userRef.doc(partyMembers[0].id).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            if (userData.liked_places) {
              partyLocations.push(...userData.liked_places);
            } else {
              console.error(`The 'liked_places' field does not exist in the user
                document with ID ${partyMembers[0].id}.`);
            }
          } else {
            console.error(`The userData does not exist in the user
              document with ID ${partyMembers[0].id}.`);
          }
        } else {
          console.error(`The userDoc document does not exist in the user
              collection with ID ${partyMembers[0].id}.`);
        }

        // store the locations array in the party{count} document
        batch.set(partyDocRef, {locations: partyLocations}, {merge: true});


        for (let i = 0; i < partyMembers.length; i++) {
          batch.set(partyDocRef, {["member" + (i)]: partyMembers[i]}
              , {merge: true});
        }

        return batch.commit() .then(() => {
          console.log("Batch write successful!");
        })
            .catch((error) => {
              console.error("Batch write failed: ", error);
            });
      }
    });

