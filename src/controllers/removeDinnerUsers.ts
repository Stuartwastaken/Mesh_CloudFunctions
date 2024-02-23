import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {notifyUser} from "./sendNotifications";
import {unqueueUser} from "../utils/unqueueUser";

export const removeDinnerUsers = functions.pubsub
    .schedule("*/15 * * * 0")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const db = admin.firestore();
      const lobbyCollectionRef = db.collection("lobby_friday_dinner");
      const snapshot = await lobbyCollectionRef.get();

      snapshot.forEach(async (doc) => {
        const data = doc.data();
        const member0Ref: FirebaseFirestore.DocumentReference = data.member0;
        const member1Ref: FirebaseFirestore.DocumentReference = data.member1;

        // Call unqueueUser function
        await unqueueUser(true, member0Ref);
        if (member1Ref) {
          await unqueueUser(true, member1Ref);
        }

        // Call notifyUser function
        const notificationMessage = {
          title: "Dinner Update",
          body: "Couldn't form a group this week. Try again next week!",
        };

        await notifyUser(member0Ref.id, notificationMessage);
        if (member1Ref) {
          await notifyUser(member1Ref.id, notificationMessage);
        }
      });
    });

