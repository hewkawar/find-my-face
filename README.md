# Find My Face (AI Face Recognition)

ระบบค้นหาใบหน้า (Face Recognition) ที่สามารถค้นหาใบหน้าที่ตรงกันจากรูปภาพจำนวนมหาศาล (100,000+ รูป) โดยใช้เทคโนโลยี Serverless และ Edge Computing ช่วยให้ระบบทำงานได้อย่างรวดเร็ว รองรับผู้ใช้งานจำนวนมากได้พร้อมกัน และประหยัดค่าใช้จ่าย

## 🏗️ Architecture (สถาปัตยกรรม)

- **Frontend**: React (Vite) + Tailwind CSS v4 + `face-api.js` (รัน AI สกัด Vector บนหน้าเว็บโดยตรงเพื่อลดภาระ Backend)
- **Backend**: Cloudflare Workers (Serverless API)
- **Database**: Cloudflare Vectorize (Vector Database สำหรับค้นหาหน้าคนจากความคล้ายคลึง)
- **Storage**: AWS S3 (สำหรับเก็บรูปภาพต้นฉบับ)

## 🌟 Features

- 📸 อัปโหลดรูปภาพเพื่อค้นหาคนที่มีใบหน้าเหมือนกันได้ทันที
- 🧠 สกัด Face Embedding (Vector) ภายใน Web Browser ปลอดภัยและรวดเร็ว
- ⚡️ Infinite Scroll รองรับการแสดงผลลัพธ์จำนวนมากโดยที่บราวเซอร์ไม่กระตุก
- 🚀 สคริปต์ทำ Indexing รูปภาพ (Parallel Processing) สำหรับการดันรูปขึ้น S3 และ Vectorize พร้อมกันทีละหลายๆ ไฟล์

---

## 🚀 Getting Started (วิธีการติดตั้ง)

### 1. การตั้งค่า Backend (Cloudflare Workers)

1. เข้าไปที่โฟลเดอร์ `backend`
   ```bash
   cd backend
   npm install
   ```
2. ล็อกอินเข้า Cloudflare 
   ```bash
   npx wrangler login
   ```
3. สร้าง Vectorize Database ชื่อว่า `desup-face-index`
   ```bash
   npx wrangler vectorize create desup-face-index --dimensions=128 --metric=cosine
   ```
4. รันระบบ Local (สำหรับการทดสอบ) หรือ Deploy ขึ้น Cloudflare
   ```bash
   npm run dev      # ทดสอบในเครื่อง
   npm run deploy   # อัปโหลดขึ้น Production
   ```

### 2. การตั้งค่า Frontend (React)

1. เข้าไปที่โฟลเดอร์ `frontend`
   ```bash
   cd frontend
   npm install
   ```
2. เริ่มการทำงาน
   ```bash
   npm run dev
   ```
   > **Note**: อย่าลืมแก้ API URL ใน `App.tsx` ให้ตรงกับ Worker ของคุณหากรันบน Production

### 3. การเพิ่มข้อมูลรูปภาพ (Indexing)

ระบบมีสคริปต์สำหรับใช้อัปโหลดรูปขึ้น S3 และสกัด Vector เก็บเข้า Cloudflare ให้โดยอัตโนมัติ 

1. ก็อปปี้ไฟล์ `.env.example` เป็น `.env` ในโฟลเดอร์ `backend` และกรอกข้อมูล AWS S3 และ Cloudflare API ของคุณ
2. นำรูปภาพที่ต้องการใส่ไว้ในโฟลเดอร์ `backend/images/`
3. รันสคริปต์:
   ```bash
   cd backend
   node scripts/upload_and_process.mjs [S3-FOLDER-NAME]
   ```
   *ตัวอย่าง: `node scripts/upload_and_process.mjs faces/batch1/`*

## 📜 License

This project is licensed under the [MIT License](LICENSE).
