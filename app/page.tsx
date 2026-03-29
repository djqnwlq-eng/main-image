"use client";

import { useState, useEffect, useRef } from "react";
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

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, options);
    if (res.ok || i === retries) return res;
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return fetch(url, options);
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
  const [customStyle, setCustomStyle] = useState("");
  const [useCustomStyle, setUseCustomStyle] = useState(false);

  const [bgRemovalFailed, setBgRemovalFailed] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});

  // 경과 시간 타이머
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const toggleSection = (num: number) => {
    setCollapsedSections((prev) => ({ ...prev, [num]: !prev[num] }));
  };

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
    startTimer();
    try {
      const compressed = await compressImage(referenceImage);
      const res = await fetchWithRetry("/api/analyze", {
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
      stopTimer();
    }
  };

  const canGenerate = productImageRemoved && (useCustomStyle ? customStyle.trim() : analysis);

  const handleGenerate = async () => {
    if (!productImageRemoved) return;
    if (!useCustomStyle && (!analysis || !referenceImage)) return;
    setIsGenerating(true);
    setError(null);
    startTimer();
    try {
      const compressedProduct = await compressImage(productImageRemoved);
      const body: Record<string, unknown> = {
        productImage: compressedProduct,
        analysis: useCustomStyle ? null : analysis,
        customStyle: useCustomStyle ? customStyle : undefined,
      };
      if (!useCustomStyle && referenceImage) {
        body.referenceImage = await compressImage(referenceImage);
      }
      const res = await fetchWithRetry("/api/generate", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
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
      stopTimer();
    }
  };

  const handleUpscale = async (index: number) => {
    const image = generatedImages[index];
    setUpscalingIndex(index);
    setError(null);
    try {
      const res = await fetchWithRetry("/api/upscale", {
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

  const handleDeleteImage = (index: number) => {
    setGeneratedImages((prev) => prev.filter((_, i) => i !== index));
    setUpscaledMap((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      }
      return next;
    });
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

  const currentStep = generatedImages.length > 0 ? 5 : (analysis || (useCustomStyle && customStyle.trim())) ? 4 : referenceImage ? 3 : productImageRemoved ? 2 : 1;
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
        <div className="max-w-5xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            스마트스토어 썸네일 생성기
          </h1>
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
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
        <div className="max-w-5xl mx-auto px-4 py-2 sm:py-3 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {steps.map((step, i) => (
              <div key={step.num} className="flex items-center">
                <div className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium transition-colors ${
                  currentStep >= step.num ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"
                }`}>
                  <span className={`w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full text-[9px] sm:text-[10px] font-bold ${
                    currentStep >= step.num ? "bg-blue-600 text-white" : "bg-gray-300 text-white"
                  }`}>{step.num}</span>
                  <span>{step.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-300 mx-0.5 sm:mx-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span className="flex-1 mr-2">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold shrink-0">X</button>
          </div>
        )}

        {/* 1. 상품 이미지 + 배경 제거 */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection(1)}
            className="w-full flex items-center justify-between p-4 sm:p-6 pb-0 text-left"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-gray-900">1. 상품 이미지</h2>
              {productImageRemoved && collapsedSections[1] && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">완료</span>
              )}
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${collapsedSections[1] ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections[1] && (
            <div className="p-4 sm:p-6 pt-3 sm:pt-4">
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
            className="w-full flex items-center justify-between p-4 sm:p-6 pb-0 text-left"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-gray-900">2. 레퍼런스 이미지</h2>
              {(referenceImage || useCustomStyle) && collapsedSections[2] && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">완료</span>
              )}
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${collapsedSections[2] ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections[2] && (
            <div className="p-4 sm:p-6 pt-3 sm:pt-4">
              {/* 모드 전환 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setUseCustomStyle(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${!useCustomStyle ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  레퍼런스 이미지
                </button>
                <button
                  onClick={() => setUseCustomStyle(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${useCustomStyle ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  직접 입력
                </button>
              </div>

              {useCustomStyle ? (
                <div>
                  <textarea
                    value={customStyle}
                    onChange={(e) => setCustomStyle(e.target.value)}
                    placeholder="원하는 배경 스타일을 설명해주세요. 예: 밝은 베이지 톤 배경, 왼쪽 위에서 자연광, 부드러운 그림자, 미니멀한 분위기"
                    className="w-full h-32 p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-2">배경 색상, 조명, 그림자, 분위기 등을 자유롭게 설명하세요.</p>
                </div>
              ) : (
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
              )}
            </div>
          )}
        </section>

        {/* 3. Analysis (레퍼런스 이미지 모드일 때만) */}
        {!useCustomStyle && referenceImage && (
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleSection(3)}
              className="w-full flex items-center justify-between p-4 sm:p-6 pb-0 text-left"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-gray-900">3. 레퍼런스 분석</h2>
                {analysis && collapsedSections[3] && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">완료</span>
                )}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${collapsedSections[3] ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsedSections[3] && (
              <div className="p-4 sm:p-6 pt-3 sm:pt-4">
                <div className="flex justify-end mb-4">
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isAnalyzing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {isAnalyzing ? `분석 중... ${elapsed}초` : analysis ? "다시 분석" : "레퍼런스 분석하기"}
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

        {/* 4. 썸네일 생성 */}
        {canGenerate && productImageRemoved && (
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6 pb-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm sm:text-base font-bold text-gray-900">4. 썸네일 생성</h2>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-3 sm:px-4 py-2 bg-purple-600 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isGenerating && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isGenerating ? `생성 중... ${elapsed}초` : generatedImages.length > 0 ? "추가 생성" : "썸네일 생성하기"}
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 pt-3 sm:pt-4">
              {isGenerating && generatedImages.length === 0 && (
                <div className="flex items-center justify-center h-48 text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">AI가 썸네일을 생성하고 있습니다... {elapsed}초</span>
                  </div>
                </div>
              )}
              {generatedImages.length > 0 && (
                <GeneratedImages
                  images={generatedImages}
                  onUpscale={handleUpscale}
                  onDownload={handleDownload}
                  onDelete={handleDeleteImage}
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
