import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const quitLobby = functions.firestore
    .document("quit_lobby_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const partyMembers: FirebaseFirestore.DocumentReference[] =
      snapshot.data()?.party;
      const today = snapshot.data()?.today;
      let queuedWithPeople = false;

      if (!partyMembers || partyMembers.length === 0) {
        console
            .warn("Party members from quit_lobby_tempbin not found or empty.");
        return null;
      }

      const authUidRef = partyMembers[0];
      partyMembers.shift(); // Remove the authUidRef from the partyMembers array

      // Delete party member documents in the partyType collection for each user
      const partyType = today ? "party_today" : "party_tomorrow";
      const batch = admin.firestore().batch();

      // Process authUidRef's documents
      const authUidPartyDocsSnapshot =
      await authUidRef.collection(partyType).get();
      for (const partyDoc of authUidPartyDocsSnapshot.docs) {
        const personUid = partyDoc.data()?.uid;

        if (personUid.id !== authUidRef.id) {
          batch.delete(partyDoc.ref);
          // Get the user document and append
          // the document reference to the partyMembers array
          const personDocRef = admin.firestore().doc(`user/${personUid.id}`);
          partyMembers.push(personDocRef);
        } else {
          const userRef = admin.firestore().doc(authUidRef.path);
          const userDoc = await userRef.get();
          const userData = userDoc.data();

          batch.update(userRef, {
            queuedToday: today ? false : userData?.queuedToday,
            queuedTomorrow: today ? userData?.queuedTomorrow : false,
          });
        }
      }
      const userRef = admin.firestore().doc(authUidRef.path);
      if (partyMembers.length > 0) {
        batch.update(userRef, {two_and_two_queued: false});
        queuedWithPeople = true;
      } else {
        batch.update(userRef, {meet_three_people_queued: false});
      }

      // Process documents for the other party members
      for (const memberRef of partyMembers) {
        const memberPartyDocsSnapshot =
    await memberRef.collection(partyType).get();
        for (const partyDoc of memberPartyDocsSnapshot.docs) {
          const personUid = partyDoc.data()?.uid;

          if (personUid.id !== memberRef.id) {
            batch.delete(partyDoc.ref);
          } else {
            const userRef = admin.firestore().doc(memberRef.path);
            const userDoc = await userRef.get();
            const userData = userDoc.data();

            batch.update(userRef, {
              queuedToday: today ? false : userData?.queuedToday,
              queuedTomorrow: today ? userData?.queuedTomorrow : false,
              two_and_two_queued: queuedWithPeople ?
          false : userData?.two_and_two_queued,
              meet_three_people_queued: queuedWithPeople ?
          userData?.meet_three_people_queued : false,
            });
          }
        }
      }

      await batch.commit();
      console.log(`Deleted non-user documents in ${partyType} 
    collections for all users in the party and updated "queuedToday" field.`);

      const lobbyQuerySnapshot = await admin.firestore()
          .collection("lobby_tonight")
          .where("member0", "==", authUidRef).get();

      if (lobbyQuerySnapshot.empty) {
        console.warn(`Lobby not found for member0 ${authUidRef.path}.`);
        return null;
      }

      const lobbyDocRef = lobbyQuerySnapshot.docs[0].ref;
      await lobbyDocRef.delete();
      console.log(`Deleted lobby document ${lobbyDocRef.path}.`);

      return null;
    });
