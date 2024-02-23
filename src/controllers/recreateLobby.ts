import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {unqueueUser} from "../utils/unqueueUser";

export const recreateLobby = functions.pubsub
    .schedule("0 0 * * *")
    .timeZone("America/Chicago")
    .onRun(async () => {
      const outingTypes = ["coffee", "dinner"];

      for (const outingType of outingTypes) {
        const lobbyTonightRef = admin.firestore()
            .collection(`lobby_tonight_${outingType}`);
        const lobbyTomorrowRef = admin.firestore()
            .collection(`lobby_tomorrow_${outingType}`);
        const groupedTonightRef = admin.firestore()
            .collection("grouped_tonight");

        const batch1 = admin.firestore().batch();
        const batch2 = admin.firestore().batch();
        const batch3 = admin.firestore().batch();

        const lobbyTonightSnapshot = await lobbyTonightRef.get();
        const unqueueUserPromises: Promise<void>[] = [];

        if (lobbyTonightSnapshot.empty) {
          console.log(`No documents found in lobby_tonight_${outingType}.`);
        }

        lobbyTonightSnapshot.forEach((doc) => {
          const data = doc.data();
          const member0: FirebaseFirestore.DocumentReference = data?.member0;
          unqueueUserPromises.push(unqueueUser(true, member0));
          batch1.delete(doc.ref);
        });

        await Promise.all(unqueueUserPromises);
        await batch1.commit();


        console
            .log(`Batch1 - All unqueueUser calls 
            completed and batch committed.`);
        // end of lobbyTonightRef

        // grouped_tonight - reset each users party_today to default
        const groupedTonightSnapshot = await groupedTonightRef.get();

        for (const doc of groupedTonightSnapshot.docs) {
          const data = doc.data();
          const members = data?.members;

          // If there are no members in the array, skip this iteration
          if (!members) continue;

          for (const memberRef of members) {
            await memberRef.update({queuedToday: false});
            // Get the memberRef document data
            const memberData = (await memberRef.get()).data();

            // If queuedTomorrow is false, set two_and_two_queued
            // and meet_three_people_queued to false
            if (!memberData?.queuedTomorrow) {
              await memberRef.update({
                two_and_two_queued: false,
                meet_three_people_queued: false,
              });
            }
            // Get the party_today subcollection of each member
            const partyTodaySnapshot =
           await memberRef.collection("party_today").get();

            // Create a batch for deleting multiple documents
            const memberBatch = admin.firestore().batch();

            for (const partyDoc of partyTodaySnapshot.docs) {
              const personUid = partyDoc.data()?.uid;

              // Check if the uid field is not the same as the user
              // in which you are in the sub_collection for
              if (personUid.id !== memberRef.id) {
                memberBatch.delete(partyDoc.ref);
              }
            }

            // Commit the batch to delete the filtered documents
            await memberBatch.commit();
          }

          batch2.delete(doc.ref);
        }
        await batch2.commit();

        const lobbyTomorrowSnapshot = await lobbyTomorrowRef.get();
        lobbyTomorrowSnapshot.forEach((doc) => {
          const data = doc.data();

          if (data.member0) {
            const member0Ref = admin.firestore().doc(data.member0.path);
            batch3.update(member0Ref, {
              queuedToday: true,
              queuedTomorrow: false,
            });
          }

          if (data.member1) {
            const member0Ref = admin.firestore().doc(data.member0.path);
            const member1Ref = admin.firestore().doc(data.member1.path);
            batch3.update(member1Ref, {
              queuedToday: true,
              queuedTomorrow: false,
            });
            swapPartySubcollections(member0Ref);
            swapPartySubcollections(member1Ref);
          }

          const newDocRef = lobbyTonightRef.doc(doc.id);
          batch3.set(newDocRef, data);
          batch3.delete(doc.ref);
        });

        await batch3.commit();
        console.log(`Batch3 - Successfully recreated 
        'lobby_tonight_${outingType}' collection.`);
      }

      return null;
    });

/**
 * Swaps the contents of the party_today and party_tomorrow subcollections
 * for a given member's document reference.
 *
 * @async
 * @function
 * @param {FirebaseFirestore.DocumentReference} memberRef -
 * The document reference of the member.
 * @return {Promise<void>}
 */
async function swapPartySubcollections(memberRef:
  FirebaseFirestore.DocumentReference) {
  const partyTodayRef = memberRef.collection("party_today");
  const partyTomorrowRef = memberRef.collection("party_tomorrow");

  const partyTodaySnapshot = await partyTodayRef.get();
  const partyTomorrowSnapshot = await partyTomorrowRef.get();

  const batch = admin.firestore().batch();

  // Store party_today documents in a temporary object
  const tempPartyToday: { [id: string]: FirebaseFirestore.DocumentData } = {};
  partyTodaySnapshot.forEach((doc) => {
    tempPartyToday[doc.id] = doc.data();
    batch.delete(doc.ref); // Delete party_today documents
  });

  // Copy party_tomorrow to party_today and delete party_tomorrow documents
  partyTomorrowSnapshot.forEach((doc) => {
    batch.set(partyTodayRef.doc(doc.id), doc.data());
    batch.delete(doc.ref);
  });

  // Copy temporary object's documents to party_tomorrow
  for (const [id, data] of Object.entries(tempPartyToday)) {
    batch.set(partyTomorrowRef.doc(id), data);
  }

  await batch.commit();
}
