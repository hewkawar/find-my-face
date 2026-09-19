import { useState, useRef, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Upload, Search, Loader2 } from 'lucide-react';

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // States for Infinite Scroll
  const [allResults, setAllResults] = useState<any[]>([]);
  const [displayCount, setDisplayCount] = useState(12); // เริ่มแสดงผลที่ 12 รูป
  const [searchMode, setSearchMode] = useState<'single' | 'group'>('single');

  const imageRef = useRef<HTMLImageElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // โหลด AI Models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        setIsModelLoaded(true);
      } catch (e) {
        console.error("Error loading models:", e);
      }
    };
    loadModels();
  }, []);

  // ระบบ Infinite Scroll (ดักจับการเลื่อนหน้าจอ)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // ถ้าเลื่อนมาถึงจุดล่างสุด (loadMoreRef) ให้เพิ่มจำนวนรูปที่แสดงทีละ 12
        if (entries[0].isIntersecting && allResults.length > 0) {
          setDisplayCount((prev) => Math.min(prev + 12, allResults.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) observer.unobserve(loadMoreRef.current);
    };
  }, [allResults.length]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setImage(url);
      setAllResults([]);
      setDisplayCount(12); // รีเซ็ตกลับไปโชว์ 12 รูปแรกเมื่อเปลี่ยนรูป
    }
  };

  const handleSearch = async () => {
    if (!imageRef.current || !isModelLoaded) return;
    
    setIsProcessing(true);
    setAllResults([]);
    setDisplayCount(12);

    try {
      let detections: any[] = [];
      
      if (searchMode === 'single') {
        const det = await faceapi.detectSingleFace(imageRef.current)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (det) detections = [det];
      } else {
        detections = await faceapi.detectAllFaces(imageRef.current)
          .withFaceLandmarks()
          .withFaceDescriptors();
      }
      
      if (!detections || detections.length === 0) {
        alert("ไม่พบใบหน้าในรูปภาพที่อัปโหลด กรุณาลองรูปอื่นครับ");
        setIsProcessing(false);
        return;
      }

      // 2. ส่งไปหาหน้าเหมือนสำหรับทุกๆ ใบหน้าที่เจอ
      let allFoundMatches: any[] = [];

      for (const detection of detections) {
        const descriptor = Array.from(detection.descriptor);
        
        const response = await fetch(`${import.meta.env.VITE_API_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vector: descriptor, topK: 50, threshold: 0.7 }) 
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.matches) {
            allFoundMatches = [...allFoundMatches, ...data.matches];
          }
        }
      }
      
      // กรองผลลัพธ์ซ้ำ (บางทีหน้าคน A และคน B ในรูปเดียวกัน อาจจะเจอรูปผลลัพธ์เดียวกันถ้ามาจากรูปกลุ่มรูปเดียวกัน)
      const uniqueMatches = Array.from(new Map(allFoundMatches.map(m => [m.id, m])).values());
      
      // เรียงตามคะแนนความเหมือน
      uniqueMatches.sort((a, b) => b.score - a.score);

      setAllResults(uniqueMatches);

    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการค้นหา");
    } finally {
      setIsProcessing(false);
    }
  };

  const displayedResults = allResults.slice(0, displayCount);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">AI Face Search</h1>
          <p className="text-gray-600">ค้นหาใบหน้าที่ตรงกันจากฐานข้อมูลรูปภาพทั้งหมด</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
          {!isModelLoaded ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>กำลังโหลดโมเดล AI (กรุณารอสักครู่)...</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">

              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-12 h-12 text-gray-400 mb-4" />
                    <span className="text-sm font-medium text-gray-700">คลิกเพื่ออัปโหลดรูปภาพ</span>
                    <span className="text-xs text-gray-500 mt-1">รองรับ JPEG, PNG</span>
                  </label>
                </div>

                <div className="flex flex-col space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-sm font-medium text-gray-700">รูปแบบการค้นหา:</p>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="searchMode" 
                      value="single" 
                      checked={searchMode === 'single'}
                      onChange={() => setSearchMode('single')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">ค้นหาเฉพาะหน้าหลัก (รูปเดี่ยว - รวดเร็ว)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="searchMode" 
                      value="group" 
                      checked={searchMode === 'group'}
                      onChange={() => setSearchMode('group')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">ค้นหาทุกคนในภาพ (รูปกลุ่ม - ใช้เวลาประมวลผลนานกว่า)</span>
                  </label>
                </div>

                {image && (
                  <button
                    onClick={handleSearch}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    <span>{isProcessing ? "กำลังค้นหา..." : "ค้นหาใบหน้าที่ตรงกัน"}</span>
                  </button>
                )}
              </div>

              <div className="bg-gray-100 rounded-xl overflow-hidden min-h-[300px] flex items-center justify-center relative">
                {image ? (
                  <img
                    ref={imageRef}
                    src={image}
                    alt="Uploaded"
                    className="max-w-full max-h-full object-contain"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span className="text-gray-400">ภาพตัวอย่าง</span>
                )}
              </div>

            </div>
          )}
        </div>

        {/* ส่วนแสดงผลลัพธ์แบบ Infinite Scroll */}
        {allResults.length > 0 && (
          <div className="space-y-4 pb-12">
            <div className="flex justify-between items-end border-b pb-2">
              <h2 className="text-2xl font-bold text-gray-900">ผลการค้นหา</h2>
              <span className="text-gray-500 text-sm">พบทั้งหมด {allResults.length} รายการ</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {displayedResults.map((match, idx) => {
                // ถ้ามี URL จริงจาก metadata ให้ใช้ ถ้าไม่มีให้ใช้ Placeholder
                const imgUrl = match.metadata?.url || `https://placehold.co/400x400?text=Match+${idx + 1}`;
                const filename = match.metadata?.filename || match.id;

                return (
                  <div key={`${match.id}-${idx}`} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="aspect-square bg-gray-100 relative w-full">
                      <img
                        src={imgUrl}
                        alt={`Match ${idx}`}
                        loading="lazy" // โหลดรูปเมื่อเลื่อนมาเจอเท่านั้น ช่วยประหยัดเน็ต
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4 flex-1">
                      <p className="text-xs text-gray-500 truncate mb-1" title={filename}>{filename}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Score</span>
                        <span className="text-sm font-bold text-blue-600">{(match.score * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* จุดเช็คสำหรับ Infinite Scroll */}
            {displayCount < allResults.length && (
              <div ref={loadMoreRef} className="py-8 flex justify-center items-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">กำลังโหลดรูปภาพเพิ่มเติม...</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
