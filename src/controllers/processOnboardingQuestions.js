const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  admin.initializeApp();
}

const OPENAI_API_KEY = functions.config().openai.api_key;

exports.processOnboardingQuestions = functions.firestore
    .document("users/{userId}/onboarding_questions/{docId}")
    .onCreate(async (snap, context) => {
      const data = snap.data();
      const {userId} = context.params;

      // Extract questions and responses
      const questions = data.questions || [];
      const responses = data.responses || [];

      // Validate data before proceeding
      if (!questions.length || !responses.length || responses.length !== questions.length) {
        console.error("Invalid questionnaire data.");
        return null;
      }

      // Construct user data string
      const userDataString = questions.map((q, i) => `- ${q}: ${responses[i]}`).join("\n");

      // OpenAI Prompt
      const messages = [
        {
          role: "system",
          content: `
          You are a temperament analysis assistant. Assign users to one of four archetypes based on their personality data. The archetypes are:

1. **Espresso (The Bold):** Decisive and action-oriented leaders.  
2. **Matcha (The Radiant):** Energetic and socially vibrant connectors.  
3. **Chai (The Calm):** Steady, empathetic, and harmonious.  
4. **Honey Lavender (The Introspective):** Thoughtful, reflective, and grounded.

Respond in this exact format:
- Archetype: [Chosen archetype]  
- Description: [Describe the archetype in under 150 characters.]  
- Why It Fits: [Explain in under 80 characters based on user data.]

Here is the user's data:
${userDataString}
        `.trim(),
        },
      ];

      try {
      // Call OpenAI's Chat Completion API
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: messages,
            max_tokens: 250,
            temperature: 0.2,
          }),
        });

        const responseData = await response.json();

        if (
          !responseData ||
        !responseData.choices ||
        !responseData.choices[0].message ||
        !responseData.choices[0].message.content
        ) {
          console.error("Invalid response from OpenAI API:", responseData);
          return null;
        }

        // Parse response
        const output = responseData.choices[0].message.content.trim();
        const archetypeMatch = output.match(/- Archetype:\s*(.+)/i);
        const descriptionMatch = output.match(/- Description:\s*(.+)/i);
        const whyItFitsMatch = output.match(/- Why It Fits:\s*(.+)/i);

        // Standardize archetype formatting
        const rawArchetype = archetypeMatch ? archetypeMatch[1].trim() : "Unknown";
        const standardizedArchetype = rawArchetype
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase()) // Capitalize each word
            .replace(/\s+/g, " "); // Remove extra spaces

        const description = descriptionMatch ? descriptionMatch[1].trim() : "No description provided.";
        const whyItFits = whyItFitsMatch ? whyItFitsMatch[1].trim() : "No explanation provided.";

        // Firestore batch update: write to the onboarding_questions document and update the user's document
        const batch = admin.firestore().batch();
        const userDocRef = admin.firestore().collection("users").doc(userId);
        const onboardingDocRef = snap.ref;

        batch.update(onboardingDocRef, {
          archetype: standardizedArchetype,
          archetype_description: description,
          archetype_reasoning: whyItFits,
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        batch.update(userDocRef, {
          insight_generated: true,
        });

        await batch.commit();

        console.log(`Archetype written to Firestore as "${standardizedArchetype}" and insight_generated set for user ${userId}.`);
        return null;
      } catch (error) {
        console.error("Error processing onboarding questions:", error);
        return null;
      }
    });
