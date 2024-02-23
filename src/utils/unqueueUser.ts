import * as admin from "firebase-admin";


/**
 * Unqueues a user by adding their document reference
 *  to the quit_lobby_tempbin collection.
 *
 * @param {boolean} todayArg - A boolean indicating
 *  if the user is queued for friday or saturday.
 * @param {FirebaseFirestore.DocumentReference} userRefArg
 * - The user's Firestore document reference.
 * @return {Promise<void>}
 */
export async function unqueueUser(todayArg: boolean,
    userRefArg: FirebaseFirestore.DocumentReference): Promise<void> {
  const partyMembers: FirebaseFirestore.DocumentReference[] = [];
  const today = todayArg;
  const authUidRef = userRefArg;

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
    }
  }
  const userRef = admin.firestore().doc(authUidRef.path);
  const userDoc = await userRef.get();
  const userData = userDoc.data();
  const queuedToday: boolean = userDoc.data()?.queuedToday;
  const queuedTomorrow: boolean = userDoc.data()?.queuedTomorrow;
  console.log("queuedToday: ", queuedToday,
      "queuedTomorrow: ", queuedTomorrow);

  if (queuedToday && queuedTomorrow) {
    batch.update(userRef, {
      queuedToday: today ? false : userData?.queuedToday,
      queuedTomorrow: today ? userData?.queuedTomorrow : false,
    });
    // need to edit this we don't want
    // to always set two_and_two_queued:false
    // need another if statement
  } else if (partyMembers.length > 0) {
    batch.update(userRef, {
      two_and_two_queued: false,
      queuedToday: today ? false : userData?.queuedToday,
      queuedTomorrow: today ? userData?.queuedTomorrow : false,
    });
  } else {
    batch.update(userRef, {
      meet_three_people_queued: false,
      queuedToday: today ? false : userData?.queuedToday,
      queuedTomorrow: today ? userData?.queuedTomorrow : false,
    });
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
        const queuedToday: boolean = userDoc.data()?.queuedToday;
        const queuedTomorrow: boolean = userDoc.data()?.queuedTomorrow;

        if (queuedToday && queuedTomorrow) {
          batch.update(userRef, {
            queuedToday: today ? false : userData?.queuedToday,
            queuedTomorrow: today ? userData?.queuedTomorrow : false,
          });
        } else if (partyMembers.length > 0) {
          batch.update(userRef, {
            two_and_two_queued: false,
            queuedToday: today ? false : userData?.queuedToday,
            queuedTomorrow: today ? userData?.queuedTomorrow : false,
          });
          // queuedWithPeople = true;
        } else {
          batch.update(userRef, {
            meet_three_people_queued: false,
            queuedToday: today ? false : userData?.queuedToday,
            queuedTomorrow: today ? userData?.queuedTomorrow : false,
          });
        }
      }
    }
  }

  await batch.commit();
  console.log(`Deleted non-user documents in ${partyType} 
    collections for all users in the party and updated "queuedToday" field.`);
  if (today) {
    const member0QuerySnapshot = await admin.firestore()
        .collection("lobby_friday_dinner")
        .where("member0", "==", authUidRef).get();

    const member1QuerySnapshot = await admin.firestore()
        .collection("lobby_friday_dinner")
        .where("member1", "==", authUidRef).get();

    if (member0QuerySnapshot.empty && member1QuerySnapshot.empty) {
      console.warn(`Lobby not found for ${authUidRef.path}.`);
      return;
    }

    const lobbyDocRef = member0QuerySnapshot.empty ?
    member1QuerySnapshot.docs[0].ref :
    member0QuerySnapshot.docs[0].ref;

    await lobbyDocRef.delete();
    console.log(`Deleted lobby document ${lobbyDocRef.path}.`);
  } else {
    const member0QuerySnapshot = await admin.firestore()
        .collection("lobby_saturday_coffee")
        .where("member0", "==", authUidRef).get();

    const member1QuerySnapshot = await admin.firestore()
        .collection("lobby_saturday_coffee")
        .where("member1", "==", authUidRef).get();

    if (member0QuerySnapshot.empty && member1QuerySnapshot.empty) {
      console.warn(`Lobby not found for ${authUidRef.path}.`);
      return;
    }

    const lobbyDocRef = member0QuerySnapshot.empty ?
  member1QuerySnapshot.docs[0].ref :
  member0QuerySnapshot.docs[0].ref;

    await lobbyDocRef.delete();
    console.log(`Deleted lobby document ${lobbyDocRef.path}.`);
  }

  return;
}
