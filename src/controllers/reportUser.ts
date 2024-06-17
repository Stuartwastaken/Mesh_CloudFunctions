import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const reportUser = functions.firestore.
    document("account_strikes_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
    // snapshot.data().authUid extracts from a documents field parameter
    // for example here the snapshot is from the new document
    // the documents .data().authUid is from the authUid field
      const authUid = snapshot.data().authUid.id;
      const otherUid = snapshot.data().otherUid.id;
      const extremelyStrange: boolean = snapshot.data().extremely_strange;
      const harassment: boolean = snapshot.data().harassment;
      const quiteRude: boolean = snapshot.data().quite_rude;
      console.log("AUTH USER: ", authUid);
      console.log("OTHER USER: ", otherUid);
      // check if the user is reporting themselves
      if (authUid === otherUid) {
        throw new functions.https
            .HttpsError("unauthenticated", "You cannot report yourself.");
      }

      // Query otherUid's "account_strikes" collection
      // for a document of title strikes
      const otherUsersReports = await admin.firestore()
          .collection(`users/${otherUid}/account_strikes`)
          .doc(authUid)
          .get();

      if (!otherUsersReports.exists) {
        await admin.firestore()
            .collection(`users/${otherUid}/account_strikes`)
            .doc(authUid)
            .set({
              harassment: harassment,
              extremely_strange: extremelyStrange,
              quite_rude: quiteRude,
              comments: "",
            });
      }
    });
