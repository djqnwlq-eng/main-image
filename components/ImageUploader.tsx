"use client";

import { useCallback, useRef, useState } from "react";

interface ImageUploaderProps {
  label: string;
  description: string;
  image: string | null;
  onImageSelect: (dataUrl: string) => void;
  onImageRemove: () => void;
  disabled?: boolean;
  hideLabel?: boolean;
}

export default function ImageUploader({ label, description, image, onImageSelect, onImageRemove, disabled, hideLabel }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        onImageSelect(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }, [onImageSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  if (image) {
    return (
      <div className="relative group">
        {!hideLabel && <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>}
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <img src={image} alt={label} className="w-full h-48 object-contain" />
          <button
            onClick={onImageRemove}
            className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-sm transition-colors opacity-0 group-hover:opacity-100"
          >
            x
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!hideLabel && <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-all
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-8m0 0l-3 3m3-3l3 3M3 16.5V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18v-1.5m-18 0V7.5A2.25 2.25 0 015.25 5.25h13.5A2.25 2.25 0 0121 7.5v9" />
        </svg>
        <p className="text-sm text-gray-500">{description}</p>
        <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
      </div>
    </div>
  );
}
