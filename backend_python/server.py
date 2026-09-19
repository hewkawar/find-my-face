import cv2
import numpy as np
import requests
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import os
import io

app = FastAPI()

# ----------------- CONFIGURATION -----------------
# We use the Cloudflare worker API for searching to keep things simple
CF_WORKER_SEARCH_URL = os.getenv("CF_WORKER_SEARCH_URL", "https://find-my-face-backend.hewkawar.workers.dev/search")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
YUNET_PATH = os.path.join(MODELS_DIR, "face_detection_yunet_2023mar.onnx")
ARCFACE_PATH = os.path.join(MODELS_DIR, "arcface_resnet100.onnx")

# ----------------- LOAD MODELS -----------------
# 1. Face Detector (YuNet)
face_detector = cv2.FaceDetectorYN.create(
    model=YUNET_PATH,
    config="",
    input_size=(320, 320),
    score_threshold=0.6,
    nms_threshold=0.3,
    top_k=5000
)

# 2. Face Recognizer (ArcFace via OpenCV DNN)
arcface_net = cv2.dnn.readNetFromONNX(ARCFACE_PATH)
# Force CPU (Safe for non-AVX CPUs like Phenom II)
arcface_net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
arcface_net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

def align_face(img, landmarks):
    """
    Simple face alignment using the 5 landmarks from YuNet.
    YuNet landmarks: right_eye, left_eye, nose, right_mouth, left_mouth
    """
    # For ArcFace, the standard aligned face size is 112x112
    # This is a simplified crop for now. For production, a proper similarity transform is better.
    # But to keep it dependency-light, we'll extract the bounding box and resize.
    # bbox is [x, y, w, h]
    x, y, w, h = [int(v) for v in landmarks[:4]]
    # Add some padding
    padding = int(min(w, h) * 0.1)
    x1 = max(0, x - padding)
    y1 = max(0, y - padding)
    x2 = min(img.shape[1], x + w + padding)
    y2 = min(img.shape[0], y + h + padding)
    
    face_crop = img[y1:y2, x1:x2]
    if face_crop.size == 0:
        return cv2.resize(img, (112, 112))
        
    return cv2.resize(face_crop, (112, 112))

def get_arcface_embedding(aligned_face):
    """
    Runs the ArcFace model on a 112x112 face image and returns a 512-D vector.
    """
    # Preprocess image for ArcFace (BGR to RGB, normalize to [-1, 1])
    blob = cv2.dnn.blobFromImage(
        aligned_face, 
        scalefactor=1.0 / 127.5, 
        size=(112, 112), 
        mean=(127.5, 127.5, 127.5), 
        swapRB=True, 
        crop=False
    )
    arcface_net.setInput(blob)
    embedding = arcface_net.forward()
    # Normalize the embedding (L2 normalization)
    embedding = embedding.flatten()
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()

@app.post("/search")
async def search_face(file: UploadFile = File(...)):
    """
    Endpoint for the frontend to upload an image and search.
    """
    try:
        # Read image from upload
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image file"})

        height, width, _ = img.shape
        face_detector.setInputSize((width, height))
        
        # Detect faces
        _, faces = face_detector.detect(img)
        
        if faces is None or len(faces) == 0:
            return JSONResponse(status_code=400, content={"error": "No face detected in the image"})

        all_matches = []
        
        # We will extract features for all detected faces and query Cloudflare Vectorize
        for face in faces:
            aligned_face = align_face(img, face)
            vector_512 = get_arcface_embedding(aligned_face)
            
            # Send vector to Cloudflare Worker
            response = requests.post(
                CF_WORKER_SEARCH_URL, 
                json={"vector": vector_512, "topK": 50, "threshold": 0.3},
                timeout=10
            )
            
            if response.ok:
                data = response.json()
                if "matches" in data:
                    all_matches.extend(data["matches"])
            else:
                print(f"Cloudflare Error: {response.text}")

        # Deduplicate matches by ID
        unique_matches = {match['id']: match for match in all_matches}.values()
        sorted_matches = sorted(unique_matches, key=lambda x: x['score'], reverse=True)

        return {"matches": sorted_matches}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
