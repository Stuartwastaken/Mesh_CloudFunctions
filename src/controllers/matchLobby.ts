import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Matches parties in the lobby,
 * considering their age range and common locations.
 */
export const matchLobby = functions.pubsub
    .schedule("every 2 minutes")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const firestore = admin.firestore();

      const lobbyTonightRef = firestore.collection("lobby_tonight");
      const lobbyTonightSnapshot = await lobbyTonightRef.get();

      if (lobbyTonightSnapshot.empty) {
        console.log("No documents found in lobby_tonight.");
        return null;
      }

      const userLocations: Map<string, Set<string>> = new Map();

      lobbyTonightSnapshot.forEach((doc) => {
        const data = doc.data();
        const locations = data
            ?.locations as FirebaseFirestore.DocumentReference[];

        const member0 = data.member0?.id;
        const member1 = data.member1?.id;
        if (!locations) {
          console.warn(`Locations is null for document 
          ${doc.id}. Skipping this document.`);
          return;
        }

        locations.forEach((location) => {
          const locationId = location.id;

          if (!userLocations.has(locationId)) {
            userLocations.set(locationId, new Set());
          }

          userLocations.get(locationId)?.add(member0);
          if (member1) {
            userLocations.get(locationId)?.add(member1);
          }
        });
      });

      const commonLocations: string[] = [];
      userLocations.forEach((users, locationId) => {
        if (users.size >= 4) {
          commonLocations.push(locationId);
        }
      });

      if (commonLocations.length === 0) {
        console.log("No common locations found for 4 users.");
        return null;
      }

      // Select a random common location
      const selectedLocation =
      commonLocations[Math.floor(Math.random() * commonLocations.length)];

      // Get the first 4 users for the selected location
      const matchedUsers: string[] = Array
          .from(userLocations
              .get(selectedLocation)?.values() ?? []).slice(0, 4);

      console.log(`Matched users: ${matchedUsers
          .join(", ")} at location: ${selectedLocation}`);

      // Perform further actions with matched users
      // and location, e.g., notify users or create a new document

      return null;
    });
