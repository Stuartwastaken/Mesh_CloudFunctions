import * as admin from "firebase-admin";

admin.initializeApp();

export * from "./controllers/addFriend";
export * from "./controllers/removeFriend";
export * from "./controllers/reportUser";
export * from "./controllers/joinLobby";
export * from "./controllers/matchLobby";
export * from "./controllers/quitLobby";
export * from "./controllers/inviteFriend";
export * from "./controllers/recreateLobbyTonight";
export * from "./controllers/blockUser";
export * from "./controllers/joinFriendTonight";
export * from "./controllers/joinFriendTomorrow";
export * from "./controllers/sendNotifications";
