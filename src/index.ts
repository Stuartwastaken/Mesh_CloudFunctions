import * as admin from "firebase-admin";

admin.initializeApp();

export * from "./controllers/addFriend";
export * from "./controllers/removeFriend";
export * from "./controllers/reportUser";
export * from "./controllers/joinLobby";
export * from "./controllers/matchLobbyCoffee";
export * from "./controllers/matchLobbyDinner";
export * from "./controllers/quitLobby";
export * from "./controllers/inviteFriend";
export * from "./controllers/recreateLobby";
export * from "./controllers/blockUser";
export * from "./controllers/joinFriendTonight";
export * from "./controllers/joinFriendTomorrow";
export * from "./controllers/sendNotifications";
