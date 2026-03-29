"use client";

import { useState, useEffect } from "react";
import { removeBackground as removeImageBackground } from "@imgly/background-removal";
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
  const [upscaledMap, setUpscaledMap] = useState<Record<number, string>>({});
  const [upscalingIndex, setUpscalingIndex] = useState<number | null>(null);

  const [bgRemovalFailed, setBgRemovalFailed] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});

  const toggleSection = (num: number) => {
    setCollapsedSections((prev) => ({ ...prev, [num]: !prev[num] }));
  };

  // 단계 진행 시 이전 단계 자동 접기
  const autoCollapsePrevious = (currentStepNum: number) => {
    const collapsed: Record<number, boolean> = {};
    for (let i = 1; i < currentStepNum; i++) {
      collapsed[i] = true;
    }
    setCollapsedSections(collapsed);
  };

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

  const removeBackground = async (imageDataUrl: string) => {
    setIsRemovingBg(true);
    setBgRemovalFailed(false);
    setError(null);
    try {
      const blob = await removeImageBackground(imageDataUrl, {
        output: { format: "image/png" },
      });
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setProductImageRemoved(dataUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "배경 제거 실패";
      setError(message);
      setBgRemovalFailed(true);
    } finally {
      setIsRemovingBg(false);
    }
  };

  const handleProductImageSelect = async (dataUrl: string) => {
    setProductImage(dataUrl);
    setProductImageRemoved(null);
    setAnalysis(null);
    setGeneratedImages([]);
    setUpscaledMap({});
    setBgRemovalFailed(false);

    await removeBackground(dataUrl);
  };

  const handleAnalyze = async () => {
    if (!referenceImage) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setGeneratedImages([]);
    setUpscaledMap({});
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
      setAnalysisOpen(true);
      autoCollapsePrevious(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "분석 실패";
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!productImageRemoved || !analysis || !referenceImage) return;
    setIsGenerating(true);
    setError(null);
    try {
      const compressedProduct = await compressImage(productImageRemoved);
      const compressedReference = await compressImage(referenceImage);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          productImage: compressedProduct,
          referenceImage: compressedReference,
          analysis,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedImages((prev) => [...prev, ...data.images]);
      autoCollapsePrevious(4);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "생성 실패";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpscale = async (index: number) => {
    const image = generatedImages[index];
    setUpscalingIndex(index);
    setError(null);
    try {
      const res = await fetch("/api/upscale", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUpscaledMap((prev) => ({ ...prev, [index]: data.image }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "업스케일 실패";
      setError(message);
    } finally {
      setUpscalingIndex(null);
    }
  };

  const handleDownload = (imageDataUrl: string, format: "png" | "jpg") => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      if (format === "jpg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `thumbnail_${Date.now()}.${format === "jpg" ? "jpg" : "png"}`;
        link.click();
        URL.revokeObjectURL(url);
      }, format === "jpg" ? "image/jpeg" : "image/png", 0.95);
    };
    img.src = imageDataUrl;
  };

  const currentStep = generatedImages.length > 0 ? 5 : analysis ? 4 : referenceImage ? 3 : productImageRemoved ? 2 : 1;
  const steps = [
    { num: 1, label: "상품" },
    { num: 2, label: "배경제거" },
    { num: 3, label: "레퍼런스" },
    { num: 4, label: "분석" },
    { num: 5, label: "생성" },
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

        {/* 1. 상품 이미지 + 배경 제거 */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection(1)}
            className="w-full flex items-center justify-between p-6 pb-0 text-left"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">1. 상품 이미지</h2>
              {productImageRemoved && collapsedSections[1] && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">완료</span>
              )}
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${collapsedSections[1] ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections[1] && (
            <div className="p-6 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2">원본</div>
                  <ImageUploader
                    label="상품 이미지"
                    description="상품 사진을 업로드하세요"
                    image={productImage}
                    onImageSelect={handleProductImageSelect}
                    onImageRemove={() => {
                      setProductImage(null);
                      setProductImageRemoved(null);
                      setBgRemovalFailed(false);
                      setAnalysis(null);
                      setGeneratedImages([]);
                      setUpscaledMap({});
                    }}
                    hideLabel
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2">배경 제거</div>
                  {isRemovingBg ? (
                    <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">배경 제거 중...</span>
                      </div>
                    </div>
                  ) : bgRemovalFailed ? (
                    <div className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-red-200 bg-red-50 gap-3">
                      <p className="text-sm text-red-600">배경 제거 실패</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => productImage && removeBackground(productImage)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          다시 시도
                        </button>
                        <button
                          onClick={() => {
                            setBgRemovalFailed(false);
                            setProductImageRemoved(productImage);
                            setError(null);
                          }}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          원본으로 진행
                        </button>
                      </div>
                    </div>
                  ) : productImageRemoved ? (
                    <div
                      className="rounded-xl overflow-hidden border border-gray-200 h-48"
                      style={{
                        backgroundImage: "linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)",
                        backgroundSize: "16px 16px",
                        backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px"
                      }}
                    >
                      <img src={productImageRemoved} alt="배경 제거" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 text-sm">
                      상품 이미지를 먼저 업로드하세요
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 2. 레퍼런스 이미지 */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection(2)}
            className="w-full flex items-center justify-between p-6 pb-0 text-left"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">2. 레퍼런스 이미지</h2>
              {referenceImage && collapsedSections[2] && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">완료</span>
              )}
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${collapsedSections[2] ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections[2] && (
            <div className="p-6 pt-4">
              <ImageUploader
                label="레퍼런스 이미지"
                description="원하는 스타일의 레퍼런스 사진"
                image={referenceImage}
                onImageSelect={(url) => {
                  setReferenceImage(url);
                  setAnalysis(null);
                  setGeneratedImages([]);
                  setUpscaledMap({});
                }}
                onImageRemove={() => {
                  setReferenceImage(null);
                  setAnalysis(null);
                  setGeneratedImages([]);
                  setUpscaledMap({});
                }}
              />
            </div>
          )}
        </section>

        {/* 3. Analysis */}
        {referenceImage && (
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleSection(3)}
              className="w-full flex items-center justify-between p-6 pb-0 text-left"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">3. 레퍼런스 분석</h2>
                {analysis && collapsedSections[3] && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">완료</span>
                )}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${collapsedSections[3] ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsedSections[3] && (
              <div className="p-6 pt-4">
                <div className="flex justify-end mb-4">
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isAnalyzing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {isAnalyzing ? "분석 중..." : analysis ? "다시 분석" : "레퍼런스 분석하기"}
                  </button>
                </div>
                {analysis && (
                  <div>
                    <button
                      onClick={() => setAnalysisOpen(!analysisOpen)}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
                    >
                      <svg className={`w-4 h-4 transition-transform ${analysisOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      분석 결과 {analysisOpen ? "접기" : "보기"}
                    </button>
                    {analysisOpen && <AnalysisResultComponent analysis={analysis} />}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 4. 썸네일 생성 (업스케일/다운로드 통합) */}
        {analysis && productImageRemoved && (
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-6 pb-0">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">4. 썸네일 생성</h2>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isGenerating && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isGenerating ? "생성 중..." : generatedImages.length > 0 ? "추가 생성" : "썸네일 생성하기"}
                </button>
              </div>
            </div>
            <div className="p-6 pt-4">
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
                  onUpscale={handleUpscale}
                  onDownload={handleDownload}
                  upscaledMap={upscaledMap}
                  upscalingIndex={upscalingIndex}
                />
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
