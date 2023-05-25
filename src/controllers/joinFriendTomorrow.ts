import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const joinFriendTomorrow = functions.firestore
    .document("join_friend_tomorrow_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const authUidRef = snapshot
          .data()?.authUid as FirebaseFirestore.DocumentReference;
      const otherUidRef = snapshot
          .data()?.otherUid as FirebaseFirestore.DocumentReference;
      const geoLocation = snapshot.data().geo_location;

      if (!authUidRef || !otherUidRef) {
        console.warn("authUid or otherUid not found.");
        return null;
      }

      const authUidSnapshot = await authUidRef.get();
      const otherUidSnapshot = await otherUidRef.get();

      if (authUidSnapshot.exists && authUidSnapshot
          .data()?.queued_tomorrow === true) {
        console.log(`${authUidRef.id} is already in queue`);
        return null;
      }

      if (otherUidSnapshot.exists && otherUidSnapshot
          .data()?.queued_tomorrow === true) {
        console.log(`${otherUidRef.id} is already in queue`);
        return null;
      }
      // Check if liked_places is empty or null
      const authUidLikedPlaces = authUidSnapshot.data()?.liked_places;
      const otherUidLikedPlaces = otherUidSnapshot.data()?.liked_places;

      if (!authUidLikedPlaces || authUidLikedPlaces.length === 0) {
        console.log(`${authUidRef.id} has empty or null liked_places`);
        return null;
      }

      if (!otherUidLikedPlaces || otherUidLikedPlaces.length === 0) {
        console.log(`${otherUidRef.id} has empty or null liked_places`);
        return null;
      }

      const batch = admin.firestore().batch();

      // Write to authUid's party_today subcollection
      const authUidPartyTodayRef = authUidRef
          .collection("party_tomorrow").doc(otherUidRef.id);
      batch.set(authUidPartyTodayRef, {
        uid: otherUidRef, // Pass the Document Reference object directly
        confirmed: true,
      });

      // Write to otherUid's party_today subcollection
      const otherUidPartyTodayRef = otherUidRef
          .collection("party_tomorrow").doc(authUidRef.id);
      batch.set(otherUidPartyTodayRef, {
        uid: authUidRef, // Pass the Document Reference object directly
        confirmed: true,
      });

      // Update queuedToday and two_and_two_queued
      // fields for authUid and otherUid
      batch.update(authUidRef, {
        queuedTomorrow: true,
        two_and_two_queued: true,
      });

      batch.update(otherUidRef, {
        queuedTomorrow: true,
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
        today: false,
        party: [authUidRef, otherUidRef],
        geo_location: geoLocation,
      });

      console.log(`Added authUid and otherUid
       to the join_lobby_tempbin.`);

      return null;
    });
