import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// work that needs to be done:
// need to check if you have already
// added this person as a friend


export const addFriend = functions.firestore.
    document("add_friend_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      console.log("context:", JSON.stringify(context));
      // snapshot.data().authUid extracts from a documents field parameter
      // for example here the snapshot is from the new document
      // the documents .data().authUid is from the authUid field
      const authUid = snapshot.data().authUid.id;
      const otherUid = snapshot.data().otherUid.id;


      // Check authUid's "friends" collection
      // for a document of title otherUid
      const authFriendDoc = await admin.firestore()
          .collection(`users/${authUid}/friends`)
          .doc(otherUid)
          .get();

      // Query otherUid's "friends" collection for a document of title authUid
      const otherFriendDoc = await admin.firestore()
          .collection(`users/${otherUid}/friends`)
          .doc(authUid)
          .get();

      if (otherFriendDoc.exists && !otherFriendDoc.data()!.confirmed &&
          otherFriendDoc.data()!.sent_by_uid.id === authUid) {
        console.log(`Cannot modify: otherFriendDoc exists, 
             not confirmed, and was sent by authUid.`);
        throw new functions.https
            .HttpsError("not-found", "Was sent already by authUid");
      }


      if (!authFriendDoc.exists && !otherFriendDoc.exists) {
        const otherUserDoc = await admin.firestore()
            .collection("users").doc(otherUid).get();
        const authUserDoc = await admin.firestore()
            .collection("users").doc(authUid).get();

        if (!otherUserDoc.exists) {
          throw new functions.https
              .HttpsError("not-found", "Other user not found");
        }

        if (!authUserDoc.exists) {
          throw new functions.https
              .HttpsError("not-found", "Auth user not found");
        }

        const otherUserData = otherUserDoc.data() || {};
        const authUserData = authUserDoc.data() || {};


        // Create the documents for both authUid and otherUid
        const authUserRef = admin.firestore().doc(`users/${authUid}`);
        const otherUserRef = admin.firestore().doc(`users/${otherUid}`);

        await admin.firestore()
            .collection(`users/${authUid}/friends`)
            .doc(otherUid)
            .set({
              display_name: otherUserData.display_name,
              uid: otherUserRef,
              photo_url: otherUserData.photo_url,
              confirmed: false,
              sent_by_uid: authUserRef,
            });
        await admin.firestore()
            .collection(`users/${otherUid}/friends`)
            .doc(authUid)
            .set({
              display_name: authUserData.display_name,
              uid: authUserRef,
              photo_url: authUserData.photo_url,
              confirmed: false,
              sent_by_uid: authUserRef,
            });

        await snapshot.ref.update({response: "Friend added successfully"});
      } else {
        // If the friend document already exists,
        // set the confirmed field to true
        await authFriendDoc.ref.update({confirmed: true});
        await otherFriendDoc.ref.update({confirmed: true});

        // Check and add to friends array if necessary
        const authUserRef = admin.firestore().doc(`users/${authUid}`);
        const otherUserRef = admin.firestore().doc(`users/${otherUid}`);
        await admin.firestore()
            .collection("users")
            .doc(authUid)
            .set({
              friends: admin.firestore.FieldValue.arrayUnion(otherUserRef),
            }, {merge: true});

        await admin.firestore()
            .collection("users")
            .doc(otherUid)
            .set({
              friends: admin.firestore.FieldValue.arrayUnion(authUserRef),
            }, {merge: true});

        await snapshot.ref.update(
            {response: "Friend confirmed and added successfully"});
      }
    });
