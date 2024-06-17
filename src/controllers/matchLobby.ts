import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * @typedef {Object} Person
 * @property {"M" | "F" | "P"} gender - The gender of the person.
 * @property {number} year - The birth year of the person.
 * @property {string} name - The name of the person.
 */
interface Person {
    gender: "M" | "F" | "P";
    year: number;
    name: string;
}


/**
 * Formats groups of people into a readable string format.
 *
 * @param {Person[][]} groups - The groups of people to format.
 * @returns {string} The formatted group output as a string.
 */
// eslint-disable valid-jsdoc
function formatGroupOutput(groups: Person[][]): string {
  return groups.map((group, index) => {
    const formattedMembers = group.map((person) =>
      `${person.gender}_${person.year} ${person.name}`);
    return `Group ${index + 1}:\n` + formattedMembers.join("\n");
  }).join("\n\n");
}

/**
 * Shuffles an array in place.
 *
 * @param {any[]} array - The array to shuffle.
 */
function shuffleArray(array: any[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
}

/**
 * Sorts two people by year with added noise.
 *
 * @param {Person} a - The first person.
 * @param {Person} b - The second person.
 * @return {number} - The sort order.
 */
function sortByYearWithNoise(a: Person, b: Person): number {
  const yearA = a.year + (Math.random() * 2 - 1);
  const yearB = b.year + (Math.random() * 2 - 1);
  return yearA - yearB;
}
/**
 * Checks if a name includes "(friend)".
 *
 * @param {string} name - The name to check.
 * @return {boolean} - True if the name includes "(friend)".
 */
function isFriend(name: string): boolean {
  return name.includes("(friend)");
}


/**
 * Adjusts the gender balance in groups to ensure a more even distribution.
 * Specifically addresses scenarios where there are 3 males and 1 female
 * in a group, attempting to swap members with adjacent groups to balance
 * the gender ratio.
 *
 * @param {Person[][]} groups - An array of groups, each containing an
 *                              array of Person objects.
 */
// eslint-disable valid-jsdoc
function adjustGenderBalance(groups: Person[][]): void {
  for (let i = 0; i < groups.length; i++) {
    const maleCount = groups[i].filter((p) => p.gender === "M").length;
    const femaleCount = groups[i].filter((p) => p.gender === "F").length;

    // Check for the "3 males, 1 female" scenario
    if (maleCount === 3 && femaleCount === 1) {
      // Check adjacent groups if possible
      if (i > 0 && groups[i - 1].filter((p) => p.gender === "F").length >= 3) {
        // Swap a female from left group with a male from the current group
        const femaleToSwap = groups[i - 1].findIndex((p) => p.gender === "F");
        const maleToSwap = groups[i].findIndex((p) => p.gender === "M");
        [groups[i - 1][femaleToSwap], groups[i][maleToSwap]] =
                [groups[i][maleToSwap], groups[i - 1][femaleToSwap]];
      } else if (i < groups.length - 1 && groups[i + 1]
          .filter((p) => p.gender === "F").length >= 3) {
        // Swap a female from right group with a male from the current group
        const femaleToSwap = groups[i + 1].findIndex((p) => p.gender === "F");
        const maleToSwap = groups[i]
            .findIndex((p) => p.gender === "M");
        [groups[i + 1][femaleToSwap], groups[i][maleToSwap]] =
                [groups[i][maleToSwap], groups[i + 1][femaleToSwap]];
      }
    }
  }
}


/**
 * Groups people into balanced groups based on their attributes.
 * Attempts to form groups where the total effective size is
 * balanced and adjusts for gender balance. The function makes
 * several attempts to form balanced groups if unsuccessful.
 *
 * @param {Person[]} people - Array of Person objects to be grouped.
 * @returns {Person[][]} An array of groups, each containing an array
 *                       of Person objects.
 */
// eslint-disable valid-jsdoc
function groupPeople(people: Person[]): Person[][] {
  const maxAttempts = 10;
  let attempt = 0;
  while (attempt < maxAttempts) {
    shuffleArray(people); // Introduce randomness
    people.sort(sortByYearWithNoise); // Sort by age with some noise

    // let totalEffectiveSize = 0;
    // people.forEach((person) => {
    //   totalEffectiveSize += isFriend(person.name) ? 2 : 1;
    // });
    // console.log("totalEffectiveSize: ", totalEffectiveSize);

    const groups: Person[][] = [];
    let currentGroup: Person[] = [];
    let groupSize = 0;
    let femaleCount = 0;

    for (const person of people) {
      const effectiveSize = isFriend(person.name) ? 2 : 1;
      if (groupSize + effectiveSize > 4) {
        groups.push(currentGroup);
        currentGroup = [];
        groupSize = 0;
        femaleCount = 0;
      }

      if (groupSize + effectiveSize <= 4) {
        currentGroup.push(person);
        groupSize += effectiveSize;
        if (person.gender === "F") {
          femaleCount++;
        }
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [person];
        groupSize = effectiveSize;
        femaleCount = person.gender === "F" ? 1 : 0;
      }
    }

    if (currentGroup.length > 0) {
      console.log("Female count in group: ", currentGroup, femaleCount);
      groups.push(currentGroup);
    }

    if (groups.flat().length === people.length) {
      // Final pass to adjust gender balance
      adjustGenderBalance(groups);
      return groups; // Successfully formed groups
    }

    attempt++; // Increase attempt counter if grouping was unsuccessful
  }
  console.error("Failed to form groups after multiple attempts.");
  return []; // Return an empty array or handle as needed
}


/**
 * Fetches people from Firestore and formats them into the Person structure.
 *
 * @return {Promise<Person[]>} - A promise that resolves to an array of Person
 */
async function getPeopleFromFirestore(): Promise<Person[]> {
  const people: Person[] = [];
  const snapshot = await admin.firestore()
      .collection("lobby_jun_15_2024").get();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const genderMap: { [key: string]: "M" | "F" | "P" } = {
      male: "M",
      female: "F",
      pna: "P",
    };

    people.push({
      gender: genderMap[data.sex] || "P",
      year: parseInt(data.age.split("/")[2], 10),
      name: data.name,
    });
  });

  return people;
}

export const matchLobbyCoffee = functions.pubsub
    .schedule("*/20 * * * *") // Every 20 minutes
    .timeZone("UTC") // Optional: Set your desired time zone
    .onRun(async (context) => {
      const people = await getPeopleFromFirestore();

      console.log("People length: ", people.length);

      const groupedPeople = groupPeople(people);
      console.log(formatGroupOutput(groupedPeople));

      const unmatchedPeople = people
          .filter((person) =>
            !groupedPeople.flat().includes(person));
      if (unmatchedPeople.length > 0) {
        console.error("Unmatched people: ", unmatchedPeople);
      }
    });
