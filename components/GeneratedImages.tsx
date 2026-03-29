"use client";

import { useState } from "react";

interface GeneratedImagesProps {
  images: string[];
  onUpscale: (index: number) => Promise<void>;
  onDownload: (imageDataUrl: string, format: "png" | "jpg") => void;
  upscaledMap: Record<number, string>;
  upscalingIndex: number | null;
}

export default function GeneratedImages({ images, onUpscale, onDownload, upscaledMap, upscalingIndex }: GeneratedImagesProps) {
  const [downloadOpen, setDownloadOpen] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {images.map((img, i) => {
        const isUpscaled = i in upscaledMap;
        const isUpscaling = upscalingIndex === i;

        return (
          <div key={i} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
            {/* 업스케일 전: 단일 이미지 / 업스케일 후: 비교 */}
            {isUpscaled ? (
              <div className="grid grid-cols-2 gap-0">
                <div className="relative">
                  <span className="absolute top-2 left-2 bg-gray-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
                    원본
                  </span>
                  <img src={img} alt={`원본 ${i + 1}`} className="w-full aspect-square object-cover" />
                </div>
                <div className="relative">
                  <span className="absolute top-2 left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
                    업스케일됨
                  </span>
                  <img src={upscaledMap[i]} alt={`업스케일 ${i + 1}`} className="w-full aspect-square object-cover" />
                </div>
              </div>
            ) : (
              <div className="relative">
                <img src={img} alt={`생성 결과 ${i + 1}`} className="w-full aspect-square object-cover" />
                {isUpscaling && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="text-white text-sm font-medium">업스케일 중...</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="p-3 flex gap-2">
              <button
                onClick={() => onUpscale(i)}
                disabled={isUpscaling || isUpscaled}
                className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isUpscaled ? "업스케일 완료" : "업스케일"}
              </button>
              <div className="relative flex-1">
                <button
                  onClick={() => setDownloadOpen(downloadOpen === i ? null : i)}
                  className="w-full px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  다운로드
                </button>
                {downloadOpen === i && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
                    {isUpscaled && (
                      <>
                        <button
                          onClick={() => { onDownload(upscaledMap[i], "png"); setDownloadOpen(null); }}
                          className="w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 text-left"
                        >
                          업스케일 PNG
                        </button>
                        <button
                          onClick={() => { onDownload(upscaledMap[i], "jpg"); setDownloadOpen(null); }}
                          className="w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 text-left border-t border-gray-100"
                        >
                          업스케일 JPG
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => { onDownload(img, "png"); setDownloadOpen(null); }}
                      className={`w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 text-left ${isUpscaled ? "border-t border-gray-100" : ""}`}
                    >
                      원본 PNG
                    </button>
                    <button
                      onClick={() => { onDownload(img, "jpg"); setDownloadOpen(null); }}
                      className="w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 text-left border-t border-gray-100"
                    >
                      원본 JPG
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
