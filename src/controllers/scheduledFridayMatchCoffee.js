const functions = require("firebase-functions");
const axios = require("axios");

exports.scheduledFridayMatchCoffee = functions.pubsub
    .schedule("30 23 * * 5")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const url = "https://us-central1-mesh-alpha-7s78jh.cloudfunctions.net/ffTestMatchLobbyCoffee";

      try {
        const response = await axios.get(url);
        console.log("ffTestMatchLobbyCoffee function called successfully:", response.status);
        return null;
      } catch (error) {
        console.error("Error calling ffTestMatchLobbyCoffee function:", error);
        throw new Error("Failed to call ffTestMatchLobbyCoffee function");
      }
    });
