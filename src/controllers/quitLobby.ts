import * as functions from "firebase-functions";
import {notifyUser} from "./sendNotifications";
import {unqueueUser} from "../utils/unqueueUser";


export const quitLobby = functions.firestore
    .document("quit_lobby_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const partyMembers: FirebaseFirestore.DocumentReference[] =
      snapshot.data()?.party;
      const today = snapshot.data()?.today;

      if (!partyMembers || partyMembers.length === 0) {
        console
            .warn("Party members from quit_lobby_tempbin not found or empty.");
        return null;
      }

      const authUidRef = partyMembers[0];
      unqueueUser(today, authUidRef);

      const notificationMessage = {
        title: "Lobby Update",
        body: "You have left the lobby.",
      };

      notifyUser(authUidRef.id, notificationMessage);


      return null;
    });
