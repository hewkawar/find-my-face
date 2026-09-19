import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import canvas from 'canvas';
// import '@tensorflow/tfjs-node'; // Removed to prevent illegal instruction / native errors
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Patch face-api for Node.js environment
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Configuration
const S3_BUCKET = process.env.S3_BUCKET || 'your-bucket-name';
const S3_REGION = process.env.S3_REGION || 'ap-southeast-1';
const IMAGES_DIR = process.env.IMAGES_DIR || path.join(__dirname, '../images');
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8787/index';
const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT || '5', 10); // จำนวนไฟล์ที่ทำพร้อมกัน

// Initialize S3 Client
const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

async function fileExistsInS3(key) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true; // File exists
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error; // Other errors (e.g., auth issues)
  }
}

async function uploadToS3(filePath, key) {
  const fileStream = fs.createReadStream(filePath);
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: fileStream,
    ContentType: mimeType,
  }));
  
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

async function processSingleFile(file, s3Prefix) {
  // สร้าง S3 Key โดยเอา prefix ที่ผู้ใช้พิมพ์มาต่อหน้า
  const key = `${s3Prefix}${file}`;
  
  try {
    // 1. Check if exists in S3
    const exists = await fileExistsInS3(key);
    if (exists) {
      console.log(`✅ [SKIPPED] ${file} already exists in S3 at ${key}`);
      return;
    }

    // 2. Extract Vector
    const filePath = path.join(IMAGES_DIR, file);
    const img = await canvas.loadImage(filePath);
    
    const detections = await faceapi.detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    if (!detections) {
      console.log(`❌ [FAILED] No face detected in ${file}. Skipping.`);
      return;
    }

    const vector = Array.from(detections.descriptor);

    // 3. Upload to S3
    console.log(`⬆️ Uploading ${file} to S3 -> ${key}...`);
    const s3Url = await uploadToS3(filePath, key);

    // 4. Send to Vectorize
    console.log(`💾 Indexing ${file} to Cloudflare...`);
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: key, // Use S3 key as unique ID
        vector: vector,
        metadata: { url: s3Url, filename: file }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Backend Error: ${errText}`);
    }

    console.log(`✨ [SUCCESS] Processed and indexed ${file}!`);

  } catch (e) {
    console.error(`⚠️ [ERROR] Failed processing ${file}:`, e);
  }
}

async function processAndUpload() {
  const rl = readline.createInterface({ input, output });
  
  // ถามผู้ใช้ผ่าน Command Line
  let s3Prefix = process.argv[2]; // รองรับการใส่ค่าผ่าน arg เช่น node script.mjs my-folder/
  
  if (!s3Prefix) {
    const answer = await rl.question('📂 ระบุโฟลเดอร์/Path ใน S3 ที่ต้องการเก็บรูป (เช่น faces/ หรือ batch1/): ');
    s3Prefix = answer.trim();
  }
  rl.close();

  // จัดการ slash ด้านหลังให้ถูกต้อง
  if (s3Prefix && !s3Prefix.endsWith('/')) {
    s3Prefix += '/';
  }

  console.log(`\n======================================`);
  console.log(`เป้าหมายใน S3: ${s3Prefix || '(root bucket)'}`);
  console.log(`======================================\n`);

  console.log("Loading AI Models...");
  // Wait for WASM backend to initialize
  await faceapi.tf.ready();

  // Models are in frontend/public/models
  const modelsPath = path.resolve(__dirname, '../../frontend/public/models');
  
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath),
    faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath),
    faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath)
  ]);
  console.log("Models loaded successfully.");

  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Directory not found: ${IMAGES_DIR}. Creating it...`);
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    console.log(`Place your images in ${IMAGES_DIR} and run again.`);
    return;
  }

  const files = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'));
  console.log(`Found ${files.length} images to process.`);
  
  if (files.length === 0) {
    return;
  }

  console.log(`Starting parallel processing with concurrency limit: ${CONCURRENCY_LIMIT}`);

  // Parallel Processing with Concurrency Limit
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < files.length) {
      const file = files[currentIndex++];
      await processSingleFile(file, s3Prefix);
    }
  };

  const workers = [];
  for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  
  console.log("🎉 All processing complete!");
}

processAndUpload();
