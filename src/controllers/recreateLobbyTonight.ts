import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const recreateLobbyTonight = functions.pubsub
    .schedule("every day 00:00")
    .onRun(async () => {
      const lobbyTonightRef = admin.firestore().collection("lobby_tonight");
      const lobbyTomorrowRef = admin.firestore().collection("lobby_tomorrow");

      const batch = admin.firestore().batch();

      // Delete all documents in the "lobby_tonight" collection
      const querySnapshot = await lobbyTonightRef.get();
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Copy all documents from the "lobby_tomorrow"
      // collection to the "lobby_tonight" collection
      const querySnapshotTomorrow = await lobbyTomorrowRef.get();
      querySnapshotTomorrow.forEach((doc) => {
        const data = doc.data();
        const newDocRef = lobbyTonightRef.doc(doc.id);
        batch.set(newDocRef, data);
      });

      await batch.commit();
      console.log("Successfully recreated the 'lobby_tonight' collection.");

      return null;
    });
