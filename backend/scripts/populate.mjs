// This script simulates adding face vectors to your backend.
// In a real scenario, you would:
// 1. Fetch images from AWS S3 (e.g., using @aws-sdk/client-s3)
// 2. Extract the face embedding using face-api.js or a Python script
// 3. Call your Cloudflare Worker /index endpoint to save the vector.

const BACKEND_URL = "http://localhost:8787/index";

async function populateMockData() {
  console.log("Mocking the indexing of 3 faces...");
  
  const mockFaces = [
    {
      id: "s3-image-id-001",
      vector: Array.from({ length: 128 }, () => Math.random()),
      metadata: { url: "https://your-s3-bucket.s3.amazonaws.com/face1.jpg", name: "Person 1" }
    },
    {
      id: "s3-image-id-002",
      vector: Array.from({ length: 128 }, () => Math.random()),
      metadata: { url: "https://your-s3-bucket.s3.amazonaws.com/face2.jpg", name: "Person 2" }
    },
    {
      id: "s3-image-id-003",
      vector: Array.from({ length: 128 }, () => Math.random()),
      metadata: { url: "https://your-s3-bucket.s3.amazonaws.com/face3.jpg", name: "Person 3" }
    }
  ];

  for (const face of mockFaces) {
    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(face)
      });
      
      const result = await response.json();
      console.log(`Inserted ${face.id}:`, result);
    } catch (e) {
      console.error(`Error inserting ${face.id}:`, e);
    }
  }
}

// populateMockData(); // Uncomment to run when backend is up
console.log("To run this script, use: node backend/scripts/populate.mjs");
