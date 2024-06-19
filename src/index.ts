import * as admin from "firebase-admin";

admin.initializeApp();

export * from "./controllers/addFriend";
export * from "./controllers/removeFriend";
export * from "./controllers/reportUser";
export * from "./controllers/joinLobby";
export * from "./controllers/matchLobby";
export * from "./controllers/downloadCSV";
// export * from "./controllers/matchLobbyDinner";
export * from "./controllers/inviteFriend";
export * from "./controllers/blockUser";
export * from "./controllers/generateTestData";
// export * from "./controllers/sendNotifications";

