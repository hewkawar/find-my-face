import os
import cv2
import numpy as np
import requests
import boto3
import time
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

# ----------------- CONFIGURATION -----------------
S3_BUCKET = os.getenv("S3_BUCKET", "your-bucket-name")
S3_REGION = os.getenv("S3_REGION", "ap-southeast-1")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")

IMAGES_DIR = os.path.join(os.path.dirname(__file__), "../backend/images")
CF_WORKER_INDEX_URL = os.getenv("CF_WORKER_INDEX_URL", "https://find-my-face-backend.hewkawar.workers.dev/index")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
YUNET_PATH = os.path.join(MODELS_DIR, "face_detection_yunet_2023mar.onnx")
ARCFACE_PATH = os.path.join(MODELS_DIR, "arcface_resnet100.onnx")

# ----------------- S3 CLIENT -----------------
s3_client = boto3.client(
    's3',
    region_name=S3_REGION,
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY
)

# ----------------- LOAD MODELS -----------------
face_detector = cv2.FaceDetectorYN.create(
    model=YUNET_PATH, config="", input_size=(320, 320),
    score_threshold=0.6, nms_threshold=0.3, top_k=5000
)

arcface_net = cv2.dnn.readNetFromONNX(ARCFACE_PATH)

def align_face(img, landmarks):
    x, y, w, h = [int(v) for v in landmarks[:4]]
    padding = int(min(w, h) * 0.1)
    x1, y1 = max(0, x - padding), max(0, y - padding)
    x2, y2 = min(img.shape[1], x + w + padding), min(img.shape[0], y + h + padding)
    face_crop = img[y1:y2, x1:x2]
    if face_crop.size == 0:
        return cv2.resize(img, (112, 112))
    return cv2.resize(face_crop, (112, 112))

def get_arcface_embedding(aligned_face):
    blob = cv2.dnn.blobFromImage(
        aligned_face, scalefactor=1.0/127.5, size=(112, 112),
        mean=(127.5, 127.5, 127.5), swapRB=True, crop=False
    )
    arcface_net.setInput(blob)
    embedding = arcface_net.forward().flatten()
    return (embedding / np.linalg.norm(embedding)).tolist()

def upload_to_s3(filepath, key):
    mime = "image/png" if filepath.endswith(".png") else "image/jpeg"
    s3_client.upload_file(
        filepath, S3_BUCKET, key,
        ExtraArgs={'ContentType': mime}
    )
    return f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"

def check_exists_s3(key):
    try:
        s3_client.head_object(Bucket=S3_BUCKET, Key=key)
        return True
    except:
        return False

def flush_queue(vector_queue):
    if not vector_queue:
        return
    try:
        resp = requests.post(CF_WORKER_INDEX_URL, json=vector_queue, timeout=30)
        if not resp.ok:
            print(f"Error indexing to Cloudflare: {resp.text}")
    except Exception as e:
        print(f"Network error: {e}")
    vector_queue.clear()

def main():
    if not os.path.exists(IMAGES_DIR):
        print(f"Directory {IMAGES_DIR} not found.")
        return

    files = [f for f in os.listdir(IMAGES_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    print(f"Found {len(files)} images.")

    s3_prefix = input("📂 ระบุ S3 Prefix (เช่น faces/ หรือปล่อยว่าง): ").strip()
    if s3_prefix and not s3_prefix.endswith("/"):
        s3_prefix += "/"

    vector_queue = []
    
    for f in tqdm(files, desc="Processing Images"):
        filepath = os.path.join(IMAGES_DIR, f)
        key = f"{s3_prefix}{f}"
        
        if check_exists_s3(key):
            continue

        img = cv2.imread(filepath)
        if img is None:
            continue
            
        height, width, _ = img.shape
        face_detector.setInputSize((width, height))
        _, faces = face_detector.detect(img)
        
        if faces is None or len(faces) == 0:
            continue

        s3_url = upload_to_s3(filepath, key)
        
        for i, face in enumerate(faces):
            aligned = align_face(img, face)
            vec = get_arcface_embedding(aligned)
            face_id = key if len(faces) == 1 else f"{key}_face{i}"
            
            vector_queue.append({
                "id": face_id,
                "vector": vec,
                "metadata": {"url": s3_url, "filename": f, "faceIndex": i}
            })
            
        if len(vector_queue) >= 50:
            flush_queue(vector_queue)

    # Flush remaining
    flush_queue(vector_queue)
    print("🎉 All done!")

if __name__ == "__main__":
    main()
