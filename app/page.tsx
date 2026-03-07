"use client";

import { useState, useEffect } from "react";
import { AnalysisResult as AnalysisResultType } from "@/lib/types";
import ImageUploader from "@/components/ImageUploader";
import ApiKeyModal from "@/components/ApiKeyModal";
import AnalysisResultComponent from "@/components/AnalysisResult";
import GeneratedImages from "@/components/GeneratedImages";

function compressImage(dataUrl: string, maxWidth = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productImageRemoved, setProductImageRemoved] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResultType | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [upscaledImage, setUpscaledImage] = useState<string | null>(null);

  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("gemini_api_key");
    if (saved) setApiKey(saved);
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem("gemini_api_key", key);
  };

  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;
    return headers;
  };

  const handleProductImageSelect = async (dataUrl: string) => {
    setProductImage(dataUrl);
    setProductImageRemoved(null);
    setAnalysis(null);
    setGeneratedImages([]);
    setSelectedImageIndex(null);
    setUpscaledImage(null);
    setError(null);

    setIsRemovingBg(true);
    try {
      const compressed = await compressImage(dataUrl);
      const res = await fetch("/api/remove-bg", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ image: compressed }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProductImageRemoved(data.image);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "배경 제거 실패";
      setError(message);
      if (message.includes("API 키")) setShowApiKeyModal(true);
    } finally {
      setIsRemovingBg(false);
    }
  };

  const handleAnalyze = async () => {
    if (!referenceImage) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setGeneratedImages([]);
    setSelectedImageIndex(null);
    setUpscaledImage(null);
    try {
      const compressed = await compressImage(referenceImage);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ referenceImage: compressed }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "분석 실패";
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!productImageRemoved || !analysis) return;
    setIsGenerating(true);
    setError(null);
    try {
      const compressedProduct = await compressImage(productImageRemoved);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          productImage: compressedProduct,
          analysis,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedImages((prev) => [...prev, ...data.images]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "생성 실패";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpscale = async () => {
    if (selectedImageIndex === null) return;
    const image = generatedImages[selectedImageIndex];
    setIsUpscaling(true);
    setError(null);
    setUpscaledImage(null);
    try {
      const res = await fetch("/api/upscale", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUpscaledImage(data.image);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "업스케일 실패";
      setError(message);
    } finally {
      setIsUpscaling(false);
    }
  };

  const handleDownload = (imageDataUrl: string, format: "png" | "jpg") => {
    const link = document.createElement("a");
    if (format === "jpg") {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        link.href = canvas.toDataURL("image/jpeg", 0.95);
        link.download = `thumbnail_${Date.now()}.jpg`;
        link.click();
      };
      img.src = imageDataUrl;
    } else {
      link.href = imageDataUrl;
      link.download = `thumbnail_${Date.now()}.png`;
      link.click();
    }
  };

  const currentStep = upscaledImage ? 5 : generatedImages.length > 0 ? 4 : analysis ? 3 : (productImage && referenceImage) ? 2 : 1;
  const steps = [
    { num: 1, label: "업로드" },
    { num: 2, label: "분석" },
    { num: 3, label: "생성" },
    { num: 4, label: "업스케일" },
    { num: 5, label: "다운로드" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            스마트스토어 썸네일 생성기
          </h1>
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            API 키 {apiKey ? "(설정됨)" : "설정"}
          </button>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1">
            {steps.map((step, i) => (
              <div key={step.num} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  currentStep >= step.num ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"
                }`}>
                  <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
                    currentStep >= step.num ? "bg-blue-600 text-white" : "bg-gray-300 text-white"
                  }`}>{step.num}</span>
                  <span>{step.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <svg className="w-4 h-4 text-gray-300 mx-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4 font-bold">X</button>
          </div>
        )}

        {/* 1. Image Upload */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">1. 이미지 업로드</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploader
              label="상품 이미지"
              description="상품 사진을 업로드하세요"
              image={productImage}
              onImageSelect={handleProductImageSelect}
              onImageRemove={() => {
                setProductImage(null);
                setProductImageRemoved(null);
                setAnalysis(null);
                setGeneratedImages([]);
                setSelectedImageIndex(null);
                setUpscaledImage(null);
              }}
            />
            <ImageUploader
              label="레퍼런스 이미지"
              description="원하는 스타일의 레퍼런스 사진"
              image={referenceImage}
              onImageSelect={(url) => {
                setReferenceImage(url);
                setAnalysis(null);
                setGeneratedImages([]);
                setSelectedImageIndex(null);
                setUpscaledImage(null);
              }}
              onImageRemove={() => {
                setReferenceImage(null);
                setAnalysis(null);
                setGeneratedImages([]);
                setSelectedImageIndex(null);
                setUpscaledImage(null);
              }}
            />
          </div>
        </section>

        {/* Background Removal Result */}
        {(isRemovingBg || productImageRemoved) && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">배경 제거 결과</h2>
            {isRemovingBg ? (
              <div className="flex items-center justify-center h-48 text-gray-500">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">배경을 제거하고 있습니다...</span>
                </div>
              </div>
            ) : productImageRemoved && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-2">원본</div>
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={productImage!} alt="원본" className="w-full h-48 object-contain" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-2">배경 제거됨</div>
                  <div
                    className="rounded-xl overflow-hidden border border-gray-200"
                    style={{
                      backgroundImage: "linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)",
                      backgroundSize: "16px 16px",
                      backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px"
                    }}
                  >
                    <img src={productImageRemoved} alt="배경 제거" className="w-full h-48 object-contain" />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 2. Analysis */}
        {productImage && referenceImage && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">2. 레퍼런스 분석</h2>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isAnalyzing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isAnalyzing ? "분석 중..." : analysis ? "다시 분석" : "레퍼런스 분석하기"}
              </button>
            </div>
            {analysis && <AnalysisResultComponent analysis={analysis} />}
          </section>
        )}

        {/* 3. Generation */}
        {analysis && productImageRemoved && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">3. 썸네일 생성</h2>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isGenerating && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isGenerating ? "생성 중..." : generatedImages.length > 0 ? "추가 생성" : "썸네일 생성하기"}
              </button>
            </div>
            {isGenerating && generatedImages.length === 0 && (
              <div className="flex items-center justify-center h-48 text-gray-500">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">AI가 썸네일을 생성하고 있습니다...</span>
                </div>
              </div>
            )}
            {generatedImages.length > 0 && (
              <GeneratedImages
                images={generatedImages}
                selectedIndex={selectedImageIndex}
                onSelect={setSelectedImageIndex}
              />
            )}
          </section>
        )}

        {/* 4. Upscale */}
        {selectedImageIndex !== null && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">4. 업스케일</h2>
              <button
                onClick={handleUpscale}
                disabled={isUpscaling}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isUpscaling && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isUpscaling ? "업스케일 중..." : upscaledImage ? "다시 업스케일" : "업스케일 하기"}
              </button>
            </div>
            {isUpscaling && (
              <div className="flex items-center justify-center h-48 text-gray-500">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">이미지를 업스케일하고 있습니다...</span>
                </div>
              </div>
            )}
            {upscaledImage && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-2">원본</div>
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    <img src={generatedImages[selectedImageIndex]} alt="원본" className="w-full aspect-square object-cover" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-2">업스케일됨</div>
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    <img src={upscaledImage} alt="업스케일" className="w-full aspect-square object-cover" />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 5. Download */}
        {(selectedImageIndex !== null || upscaledImage) && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">5. 다운로드</h2>
            <div className="flex flex-wrap gap-3">
              {upscaledImage && (
                <>
                  <button
                    onClick={() => handleDownload(upscaledImage, "png")}
                    className="px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    업스케일 PNG 다운로드
                  </button>
                  <button
                    onClick={() => handleDownload(upscaledImage, "jpg")}
                    className="px-4 py-2.5 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    업스케일 JPG 다운로드
                  </button>
                </>
              )}
              {selectedImageIndex !== null && (
                <>
                  <button
                    onClick={() => handleDownload(generatedImages[selectedImageIndex], "png")}
                    className="px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    원본 PNG 다운로드
                  </button>
                  <button
                    onClick={() => handleDownload(generatedImages[selectedImageIndex], "jpg")}
                    className="px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    원본 JPG 다운로드
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSave={saveApiKey}
        currentKey={apiKey}
      />
    </div>
  );
}
