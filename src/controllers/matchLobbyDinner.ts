import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {v4 as uuidv4} from "uuid";

/**
 * Matches parties in the lobby,
 * considering their age range and common locations.
 */
export const matchLobbyDinner = functions.pubsub
    .schedule("*/1 10-17 * * *")
    .onRun(async (context) => {
      const firestore = admin.firestore();

      const lobbyTonightRef = firestore.collection("lobby_tonight_dinner");
      const lobbyTonightSnapshot = await lobbyTonightRef.get();

      if (lobbyTonightSnapshot.empty) {
        console.log("No documents found in lobby_tonight.");
        return null;
      }

      const userLocations: Map<string, Set<string>> = new Map();
      const docIdsPerUser: Map<string, string[]> = new Map();

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

        const addToDocIds = (userId: string) => {
          if (!docIdsPerUser.has(userId)) {
            docIdsPerUser.set(userId, []);
          }
          docIdsPerUser.get(userId)?.push(doc.id);
        };

        addToDocIds(member0);
        if (member1) {
          addToDocIds(member1);
        }
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
      commonLocations[Math
          .floor(Math.random() * commonLocations.length)];

      // Get the first 4 users for the selected location
      const matchedUsers: string[] = Array
          .from(userLocations
              .get(selectedLocation)?.values() ?? []).slice(0, 4);

      console.log(`Matched users: 
      ${matchedUsers.join(", ")} at 
      location: ${selectedLocation}`);

      // Get document IDs for matched users
      const matchedDocIds = new Set<string>();
      matchedUsers.forEach((userId) => {
        docIdsPerUser.get(userId)
            ?.forEach((docId) => matchedDocIds.add(docId));
      });


      const locationRef = firestore
          .collection("location").doc(selectedLocation);
      const locationData = (await locationRef.get()).data();
      const locationName = locationData?.name ?? "";

      const formatDate = (date: Date): string => {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const year = String(date.getFullYear());
        return `${month}-${day}-${year}`;
      };

      const currentTime = formatDate(new Date());

      // Write history for each of the matched users
      const groupId = uuidv4();
      const writeHistory = async (userId: string) => {
        const historyRef = firestore.collection(`user/${userId}/history`).doc();
        const metWith = matchedUsers.filter((user) => user !== userId)
            .map((user) => firestore.doc(`user/${user}`));

        await historyRef.set({
          location: locationName,
          met_with: metWith,
          time_met: currentTime,
          group_id: groupId,
        });
      };


      for (const userId of matchedUsers) {
        await writeHistory(userId);
      }
      // end of additional functionality

      // group_tonight functionality
      // Create a new document in the grouped_tonight collection
      const groupedTonightRef = firestore
          .collection("grouped_tonight").doc();
      const membersRefs = matchedUsers
          .map((user) => firestore.doc(`user/${user}`));

      await groupedTonightRef.set({
        location: firestore.collection("location").doc(selectedLocation),
        members: membersRefs,
        group_id: groupId,
      });

      console.log(`Created a new document in grouped_tonight
 with ${matchedUsers.length} members.`);


      // Delete documents from lobby_tonight
      const batch = firestore.batch();
      matchedDocIds.forEach((docId) => {
        batch.delete(lobbyTonightRef.doc(docId));
      });

      await batch.commit();
      console.log(`Deleted ${matchedDocIds.size}
       documents from lobby_tonight.`);

      return null;
    });
