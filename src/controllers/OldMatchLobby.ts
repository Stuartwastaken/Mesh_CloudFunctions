import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
/*
  console.log(JSON.stringify(parties));
      console.log(JSON.stringify(parties[0]));
      console.log(JSON.stringify(parties[0].locations));
      console.log(JSON.stringify(parties[0].member0));
      console.log(JSON.stringify(parties[1].locations));
      console.log(JSON.stringify(parties[1].member0));
      console.log(JSON.stringify(parties[2].locations));
      console.log(JSON.stringify(parties[2].member0));

*/
export const OldMatchLobby = functions.pubsub
    .schedule("every 1 minutes").onRun(async (context) => {
      const lobbyTonightRef = db.collection("lobby_tonight");
      const lobbies = await lobbyTonightRef.get();

      const match: { [location: string]: string[] } = {};

      lobbies.forEach((lobby) => {
        const location = lobby.data().locations[0];
        const members = [lobby.data().member0];

        if (lobby.data().member1) {
          members.push(lobby.data().member1);
        }

        if (!match[location]) {
          match[location] = members;
        } else {
          match[location] = match[location].concat(members);
        }
      });

      for (const location in match) {
        if (match[location].length >= 4) {
          console.log(`Match found for location ${location} with members`,
              match[location]);
          // Do further processing here, e.g. send notifications to members.
        }
      }
    });
