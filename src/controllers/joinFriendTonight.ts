import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const joinFriendTonight = functions.firestore
    .document("join_friend_tonight_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const authUidRef = snapshot
          .data()?.authUid as FirebaseFirestore.DocumentReference;
      const otherUidRef = snapshot
          .data()?.otherUid as FirebaseFirestore.DocumentReference;

      if (!authUidRef || !otherUidRef) {
        console.warn("authUid or otherUid not found.");
        return null;
      }

      const authUidSnapshot = await authUidRef.get();
      const otherUidSnapshot = await otherUidRef.get();

      if (authUidSnapshot.exists && authUidSnapshot
          .data()?.queuedToday === true) {
        console.log(`${authUidRef.id} is already in queue`);
        return null;
      }

      if (otherUidSnapshot.exists && otherUidSnapshot
          .data()?.queuedToday === true) {
        console.log(`${otherUidRef.id} is already in queue`);
        return null;
      }

      const batch = admin.firestore().batch();

      // Write to authUid's party_today subcollection
      const authUidPartyTodayRef = authUidRef
          .collection("party_today").doc(otherUidRef.id);
      batch.set(authUidPartyTodayRef, {
        uid: otherUidRef, // Pass the Document Reference object directly
        confirmed: true,
      });

      // Write to otherUid's party_today subcollection
      const otherUidPartyTodayRef = otherUidRef
          .collection("party_today").doc(authUidRef.id);
      batch.set(otherUidPartyTodayRef, {
        uid: authUidRef, // Pass the Document Reference object directly
        confirmed: true,
      });

      // Update queuedToday and two_and_two_queued
      // fields for authUid and otherUid
      batch.update(authUidRef, {
        queuedToday: true,
        two_and_two_queued: true,
      });

      batch.update(otherUidRef, {
        queuedToday: true,
        two_and_two_queued: true,
      });

      await batch.commit();
      console.log(`Added each other to the 
      party_today subcollections of
             authUid and otherUid.`);

      // Write to join_lobby_tempbin
      const joinLobbyTempbinRef = admin.firestore()
          .collection("join_lobby_tempbin").doc();
      await joinLobbyTempbinRef.set({
        today: true,
        party: [authUidRef, otherUidRef],
      });

      console.log(`Added authUid and otherUid
       to the join_lobby_tempbin.`);

      return null;
    });
