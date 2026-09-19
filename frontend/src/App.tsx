import { useState, useRef, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Upload, Search, Loader2 } from 'lucide-react';

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        // Models need to be in public/models folder
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setImage(url);
      setResults([]);
    }
  };

  const handleSearch = async () => {
    if (!imageRef.current || !isModelLoaded) return;
    
    setIsProcessing(true);
    try {
      // 1. Extract Face Embedding
      const detections = await faceapi.detectSingleFace(imageRef.current)
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (!detections) {
        alert("No face detected in the image.");
        setIsProcessing(false);
        return;
      }

      const descriptor = Array.from(detections.descriptor);
      
      // 2. Send to Backend
      const response = await fetch('http://localhost:8787/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector: descriptor })
      });
      
      if (!response.ok) throw new Error("API Error");
      
      const data = await response.json();
      setResults(data.matches || []);
      
    } catch (error) {
      console.error(error);
      alert("An error occurred during search.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">AI Face Search</h1>
          <p className="text-gray-600">Upload a photo to find matching faces from our database of 100,000+ images.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
          {!isModelLoaded ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading AI Models...</p>
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
                    <span className="text-sm font-medium text-gray-700">Click to upload a photo</span>
                    <span className="text-xs text-gray-500 mt-1">JPEG, PNG up to 10MB</span>
                  </label>
                </div>

                {image && (
                  <button
                    onClick={handleSearch}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    <span>{isProcessing ? "Searching..." : "Find Matches"}</span>
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
                  <span className="text-gray-400">Preview</span>
                )}
              </div>
              
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">Matches Found</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {results.map((match, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="aspect-square bg-gray-100 relative">
                    {/* Mock Image Display - In reality, use match.metadata.url */}
                    <img 
                      src={match.id.startsWith('http') ? match.id : `https://placehold.co/400x400?text=Match+${idx+1}`}
                      alt={`Match ${idx}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-gray-900">Score: {(match.score * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
