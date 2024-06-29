const functions = require("firebase-functions");
const axios = require("axios");

exports.scheduledWednesdayInvite = functions.pubsub
    .schedule("0 10 * * 3")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const url = "https://us-central1-mesh-alpha-7s78jh.cloudfunctions.net/ffsendInvites";

      try {
        const response = await axios.get(url);
        console.log("HTTP function called successfully:", response.status);
        return null;
      } catch (error) {
        console.error("Error calling HTTP function:", error);
        throw new Error("Failed to call HTTP function");
      }
    });
