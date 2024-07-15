import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const addFriend = functions.firestore
    .document("add_friend_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      console.log("context:", JSON.stringify(context));
      const authUid = snapshot.data().authUid.id;
      const otherUid = snapshot.data().otherUid.id;

      const authFriendDoc = await admin.firestore()
          .collection(`users/${authUid}/friends`)
          .doc(otherUid)
          .get();

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

        // Send friend request notification
        await sendFriendRequestNotification(authUid, otherUid);

        await snapshot.ref.update({response: "Friend added successfully"});
      } else {
        await authFriendDoc.ref.update({confirmed: true});
        await otherFriendDoc.ref.update({confirmed: true});

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

async function sendFriendRequestNotification(authUid: string, otherUid: string) {
  const authUserDoc = await admin.firestore().collection("users").doc(authUid).get();
  const authUserData = authUserDoc.data() || {};
  const authUserName = authUserData.display_name || "Someone";

  const otherUserTokens = await admin.firestore()
      .collection(`users/${otherUid}/fcm_tokens`)
      .get();

  const tokens: string[] = [];
  otherUserTokens.docs.forEach((token) => {
    if (token.data().fcm_token) {
      tokens.push(token.data().fcm_token);
    }
  });

  if (tokens.length === 0) {
    console.log("No FCM tokens found for otherUid");
    return;
  }

  const message = {
    notification: {
      title: "New Friend Request",
      body: `${authUserName} sent you a friend request!`,
    },
    data: {
      initialPageName: "FriendRequestPage",
      parameterData: JSON.stringify({senderUid: authUid}),
    },
    tokens: tokens,
  };

  try {
    const response = await admin.messaging().sendMulticast(message);
    console.log(`Successfully sent notification to ${response.successCount} devices`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
