"use client";

interface GeneratedImagesProps {
  images: string[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export default function GeneratedImages({ images, selectedIndex, onSelect }: GeneratedImagesProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {images.map((img, i) => (
        <div
          key={i}
          onClick={() => onSelect(i)}
          className={`
            relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all
            ${selectedIndex === i ? "border-blue-500 ring-2 ring-blue-200" : "border-transparent hover:border-gray-300"}
          `}
        >
          <img src={img} alt={`생성 결과 ${i + 1}`} className="w-full aspect-square object-cover" />
          {selectedIndex === i && (
            <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
