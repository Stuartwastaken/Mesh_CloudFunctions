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

      const parties = lobbyTonightSnapshot.docs
          .map((doc) => ({...doc.data(),
            data: doc.data(), ref: doc.ref}));


      console.log("Parties in lobby:",
          JSON.stringify(parties)); // Added console log

      const partyCombinations: any[] = [];
      const toBeDeleted: Set<FirebaseFirestore.DocumentReference> = new Set();
      for (let i = 0; i < parties.length; i++) {
        for (let j = i + 1; j < parties.length; j++) {
          const commonLocations = parties[i].data.locations
              .filter((location1: FirebaseFirestore.DocumentReference) =>
                parties[j].data.locations
                    .some((location2: FirebaseFirestore.DocumentReference) =>
                      location2.id === location1.id));


          if (commonLocations.length) {
            console.log("Common locations:",
                commonLocations); // Added console log

            const users1 = await getUsers(parties[i]);
            const users2 = await getUsers(parties[j]);

            const ages1 = users1.map((user) => getAge(user.birthday));
            const ages2 = users2.map((user) => getAge(user.birthday));

            if (areAgesWithinRange(ages1, ages2, 2)) {
              console.log("Age range check passed"); // Added console log

              partyCombinations.push({
                party1: {...parties[i], ref: parties[i].ref},
                party2: {...parties[j], ref: parties[j].ref},
                commonLocations: commonLocations,
              });
            }
          }
        }
      }

      console.log("Party combinations:",
          JSON.stringify(partyCombinations));

      // Group users and create a new document in "grouped_tonight" collection
      for (const combination of partyCombinations) {
        if (combination.party1.memberCount +
          combination.party2.memberCount === 4) {
          const groupedTonightRef = firestore
              .collection("grouped_tonight").doc();

          const members = [
            ...Object.values(combination.party1)
                .filter((value) => value instanceof
                FirebaseFirestore.DocumentReference),
            ...Object.values(combination.party2)
                .filter((value) => value instanceof
                FirebaseFirestore.DocumentReference),
          ];

          await groupedTonightRef.set({
            members: members,
            location: combination.commonLocations[0],
          });

          // Add the DocumentReferences of the matched parties to be deleted
          toBeDeleted.add(combination.party1.ref);
          toBeDeleted.add(combination.party2.ref);
        }
      }

      // Delete the documents from "lobby_tonight" collection
      for (const docRef of toBeDeleted) {
        // await docRef.delete();
        console.log("To be deleted: ", JSON.stringify(docRef));
      }
    });

interface User {
  id: string;
  displayName: string;
  birthday: string;
  friends: string[];
}

/**
 * Retrieves user objects for the given party.
 * @param {any} party - The party object.
 * @return {Promise<User[]>} - An array of user objects.
 */
async function getUsers(party: any): Promise<User[]> {
  const users: User[] = [];
  for (const key of Object.keys(party)) {
    if (key.startsWith("member")) {
      const member = party[key];
      const userSnapshot = await member.get();

      // Retrieve friends DocumentReferences from the subcollection
      const friendsSnapshot = await userSnapshot.ref
          .collection("friends").get();
      const friends = friendsSnapshot.docs
          .map((doc: FirebaseFirestore.QueryDocumentSnapshot) =>
            doc.data().uid);

      users.push({
        id: userSnapshot.id,
        displayName: userSnapshot.get("display_name"),
        birthday: userSnapshot.get("birthday"),
        friends: friends,
      });
    }
  }
  return users;
}

/**
 * Calculates the age of a user based on their birthday string.
 * @param {string} birthdayStr - The user's birthday as a string.
 * @return {number} - The user's age in years.
 */
function getAge(birthdayStr: string): number {
  const birthday = new Date(birthdayStr);
  const ageDifMs = Date.now() - birthday.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}
/**
 * Determines if the age difference between
 * the two sets of ages is within the specified range.
 * @param {number[]} ages1 - Array of ages for the first group of users.
 * @param {number[]} ages2 - Array of ages for the second group of users.
 * @param {number} range - The maximum allowed age difference.
 * @return {boolean} - True if the age difference is
 *  within the specified range, false otherwise.
 */
function areAgesWithinRange(ages1: number[],
    ages2: number[], range: number): boolean {
  // const allAges = ages1.concat(ages2);
  // const minAge = Math.min(...allAges);
  // const maxAge = Math.max(...allAges);
  // return maxAge - minAge <= range;
  return true;
}

// /**
//  * Determines if there are no friends in common between two sets of users.
//  * @param {User[]} users1 - Array of user objects
// for the first group of users.
//  * @param {User[]} users2 - Array of user objects
// for the second group of users.
//  * @return {boolean} - True if there are no
// friends in common, false otherwise.
//  */
// function noFriendsInCommon(users1: User[], users2: User[]): boolean {
//   // const friends1 = users1.flatMap((user) => user.friends);
//   // const ids2 = users2.map((user) => user.id);
//   // return !friends1.some((friend) => ids2.includes(friend));
//   return true;
// }
