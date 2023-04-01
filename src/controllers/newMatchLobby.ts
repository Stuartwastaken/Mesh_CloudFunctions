import * as functions from "firebase-functions";
import * as admin from "firebase-admin";


export const newMatchLobby = functions.pubsub
    .schedule("every 2 minutes")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const firestore = admin.firestore();

      const lobbyTonightRef = firestore.collection("lobby_tonight");
      const lobbyTonightSnapshot = await lobbyTonightRef.get();

      const parties = lobbyTonightSnapshot.docs.map((doc) => doc.data()); "";
      console.log("parties" + JSON.stringify(parties));

      const partyCombinations = [];
      for (let i = 0; i < parties.length; i++) {
        console.log("parties[i].locations" +
         JSON.stringify(parties[i].locations));

        for (let j = i + 1; j < parties.length; j++) {
          const commonLocations = parties[i].locations
              .filter((location1: FirebaseFirestore.DocumentReference) =>
                parties[j].locations
                    .some((location2: FirebaseFirestore.DocumentReference) =>
                      location2.id === location1.id));

          console.log("COMMON LOCATIONS:" + commonLocations);
          if (commonLocations.length) {
            partyCombinations.push({
              party1: parties[i],
              party2: parties[j],
              commonLocations: commonLocations,
            });
          }
        }
      }
      console.log("partyCombinations" + JSON.stringify(partyCombinations));
      for (const partyCombination of partyCombinations) {
        const users = [];
        for (const party of [partyCombination.party1,
          partyCombination.party2]) {
          for (const key of Object.keys(party)) {
            if (key.startsWith("member")) {
              const member = party[key];
              const userSnapshot = await member.get();
              users.push({
                id: userSnapshot.id,
                displayName: userSnapshot.get("display_name"),
              });
            }
          }
        }

        const locations = [];
        for (const locationRef of partyCombination.commonLocations) {
          const locationSnapshot = await locationRef.get();
          locations.push({
            id: locationSnapshot.id,
            name: locationSnapshot.get("name"),
          });
        }

        console.log(`Parties match with users: 
      ${JSON.stringify(users)} and locations: ${JSON.stringify(locations)}`);
      }
    });

