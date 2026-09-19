import React, { useState, useRef, useEffect } from 'react';
import { Upload, Search, Loader2 } from 'lucide-react';

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [allResults, setAllResults] = useState<any[]>([]);
  const [displayCount, setDisplayCount] = useState(12);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite Scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && allResults.length > 0) {
          setDisplayCount((prev) => Math.min(prev + 12, allResults.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => {
      if (loadMoreRef.current) observer.unobserve(loadMoreRef.current);
    };
  }, [allResults.length]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImage(URL.createObjectURL(file));
      setAllResults([]);
      setDisplayCount(12);
    }
  };

  const handleSearch = async () => {
    if (!imageFile) return;
    
    setIsProcessing(true);
    setAllResults([]);
    setDisplayCount(12);

    try {
      const formData = new FormData();
      formData.append("file", imageFile);

      // ส่งรูปภาพไปที่ Python Backend (ที่รันด้วย FastAPI)
      // ต้องแก้ VITE_API_URL ใน .env ให้ชี้ไปที่ IP ของ Server HewkawAr (เช่น http://IP:8000)
      const pythonApiUrl = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:8000";
      
      const response = await fetch(`${pythonApiUrl}/search`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "API Error");
      }
      
      const data = await response.json();
      setAllResults(data.matches || []);

    } catch (error: any) {
      console.error(error);
      alert(`เกิดข้อผิดพลาด: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-blue-600">
            <Search className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">Find My Face (AI)</h1>
          </div>
          <div className="text-sm text-gray-500 font-medium">ArcFace 512-D Edition</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Left Column: Upload */}
          <div className="md:col-span-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sticky top-24">
              <h2 className="text-lg font-bold text-gray-800 mb-4">ค้นหาใบหน้า</h2>
              
              <div className="space-y-4">
                {/* Upload Box */}
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

                {image && (
                  <button
                    onClick={handleSearch}
                    disabled={isProcessing}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl flex items-center justify-center space-x-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>กำลังประมวลผลด้วย AI...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        <span>ค้นหาคนหน้าเหมือน</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Preview Image */}
              {image && (
                <div className="mt-6 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                  <img src={image} alt="Preview" className="w-full h-auto max-h-64 object-contain" />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="md:col-span-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">
                ผลลัพธ์การค้นหา
              </h2>
              {allResults.length > 0 && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full">
                  พบ {allResults.length} รายการ
                </span>
              )}
            </div>

            {allResults.length === 0 && !isProcessing && (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 flex flex-col items-center justify-center min-h-[400px]">
                <Search className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-1">ยังไม่มีผลลัพธ์</p>
                <p className="text-sm">อัปโหลดรูปภาพทางด้านซ้ายเพื่อเริ่มต้นค้นหา</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {allResults.slice(0, displayCount).map((match, index) => (
                <div key={`${match.id}-${index}`} className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-shadow group">
                  <div className="aspect-[3/4] relative bg-gray-100">
                    <img
                      src={match.metadata?.url}
                      alt={match.metadata?.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <a 
                        href={match.metadata?.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-white bg-white/20 backdrop-blur-sm px-2 py-1 rounded hover:bg-white/40 transition-colors"
                      >
                        ดูรูปต้นฉบับ
                      </a>
                    </div>
                  </div>
                  <div className="p-3 border-t border-gray-100 flex items-center justify-between bg-white">
                    <div className="text-xs text-gray-500 truncate max-w-[70%]">
                      {match.metadata?.filename}
                    </div>
                    <div className={`text-sm font-bold ${match.score >= 0.85 ? 'text-green-600' : 'text-blue-600'}`}>
                      {(match.score * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Trigger Area */}
            {allResults.length > 0 && displayCount < allResults.length && (
              <div ref={loadMoreRef} className="py-8 flex justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
