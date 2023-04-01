import * as functions from "firebase-functions";
import * as admin from "firebase-admin";


export const removeFriend = functions.firestore.
    document("remove_friend_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      // snapshot.data().authUid extracts from a documents field parameter
      // for example here the snapshot is from the new document
      // the documents .data().authUid is from the authUid field
      const authUid = snapshot.data().authUid.id;
      const otherUid = snapshot.data().otherUid.id;

      // Check authUid's "friends" collection for a document of title otherUid
      const authFriendDoc = await admin.firestore()
          .collection(`user/${authUid}/friends`)
          .doc(otherUid)
          .get();

      // Query otherUid's "friends" collection for a document of title authUid
      const otherFriendDoc = await admin.firestore()
          .collection(`user/${otherUid}/friends`)
          .doc(authUid)
          .get();

      if (!authFriendDoc.exists || !otherFriendDoc.exists) {
        throw new functions.https
            .HttpsError("not-found", "Friend document not found");
      }
      // Delete the friend documents from both the authUid's collection
      // of "friends" and from the otherUid's collection of "friends"
      await admin.firestore()
          .collection(`user/${authUid}/friends`)
          .doc(otherUid)
          .delete();

      await admin.firestore()
          .collection(`user/${otherUid}/friends`)
          .doc(authUid)
          .delete();

      await snapshot.ref.update({response: "Friend removed successfully"});
    });
