// test-date-validator.js
// testing scheduledClearGroupedCollection edits

// Helper function to get the last digit of current year
const getYearLastDigit = () => {
  const year = new Date().getFullYear();
  return year.toString().slice(-1);
};

// Helper function to create the regex pattern
const createDateRegexPattern = () => {
  const lastDigit = getYearLastDigit();
  // Pattern matches: 1-2 digits, underscore, 1-2 digits, underscore, 202X (where X is 4 or 5)
  return new RegExp(`^\\d{1,2}_\\d{1,2}_202[4-${lastDigit}]$`);
};

// Mock data - mixture of valid dates and random strings
const testDocs = [
  {id: "6_10_2024", data: {someField: "value1"}},
  {id: "1_04_2025", data: {someField: "value2"}},
  {id: "3_15_2025", data: {someField: "value3"}},
  {id: "abc123xyz9", data: {someField: "value4"}},
  {id: "9x8j2k4l5m", data: {someField: "value5"}},
  {id: "12_31_2025", data: {someField: "value6"}},
];

// Function to simulate the cloud function's logic
const testDateValidation = () => {
  console.log("Starting date validation test...\n");

  const dateRegex = createDateRegexPattern();
  console.log(`Current regex pattern: ${dateRegex}\n`);

  console.log("Testing documents:");
  console.log("----------------");

  const documentsToDelete = [];

  testDocs.forEach((doc) => {
    const isValid = dateRegex.test(doc.id);
    console.log(`Document ID: ${doc.id}`);
    console.log(`Valid format? ${isValid}`);
    console.log("----------------");

    // Only delete documents that don't match the date pattern
    if (!dateRegex.test(doc.id)) {
      documentsToDelete.push(doc.id);
    }
  });

  console.log("\nSummary:");
  console.log(`Total documents tested: ${testDocs.length}`);
  console.log(`Documents to be deleted: ${documentsToDelete.length}`);
  console.log("\nDocuments that would be deleted:");
  documentsToDelete.forEach((docId) => console.log(`- ${docId}`));
};

// Run the test
testDateValidation();
