import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const recreateLobbyTonight = functions.pubsub
    .schedule("every day 00:00")
    .onRun(async () => {
      const collectionRef = admin.firestore().collection("lobby_tonight");

      const batch = admin.firestore().batch();

      const querySnapshot = await collectionRef.get();

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      return collectionRef.doc().set({foo: "bar"});
    });
