"use client";

import { AnalysisResult as AnalysisResultType } from "@/lib/types";

const LABELS: Record<keyof AnalysisResultType, string> = {
  backgroundColor: "배경 색감",
  tone: "톤",
  structures: "구조물/소품",
  shadow: "그림자",
  lightSource: "광원",
  lightDirection: "빛의 방향",
  colorPalette: "색깔",
  composition: "구도",
  cameraAngle: "화각",
  mood: "분위기",
};

interface AnalysisResultProps {
  analysis: AnalysisResultType;
}

export default function AnalysisResult({ analysis }: AnalysisResultProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(Object.entries(LABELS) as [keyof AnalysisResultType, string][]).map(([key, label]) => (
        <div key={key} className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-600 mb-1">{label}</div>
          <div className="text-sm text-gray-700">{analysis[key] || "-"}</div>
        </div>
      ))}
    </div>
  );
}
