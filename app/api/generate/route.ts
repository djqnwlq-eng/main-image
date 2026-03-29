import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

function getApiKey(request: NextRequest): string {
  const serverKey = process.env.GEMINI_API_KEY;
  if (serverKey) return serverKey;
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;
  throw new Error("API 키가 설정되지 않았습니다. 설정 버튼에서 API 키를 입력해주세요.");
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = getApiKey(request);
    const { productImage, referenceImage, analysis, customStyle } = await request.json();

    const hasReference = !!referenceImage;

    const prompt = hasReference ? `You are a professional product photographer. I am providing TWO images:
1. FIRST image: the PRODUCT (background removed) — this is the ONLY item that must appear in the final photo.
2. SECOND image: the REFERENCE photo — replicate ONLY the photography style from this image.

IMPORTANT — IGNORE these marketing/post-production elements in the reference image:
- Any text overlays, price tags, discount badges, brand stickers (e.g. "ONLY", "단독기획", "장벽 강화")
- Graphic badges, circular labels, icons, "+" symbols
- Secondary product thumbnails, sub-images, inset photos
- Watermarks, promotional text, arrows, speech bubbles
- Decorative borders, frames, or graphic overlays
These are NOT part of the original photograph. Do NOT reproduce them.

Extract and replicate ONLY the pure photography style:
- Shadow direction, angle, length, and softness: ${analysis.shadow}
- Light source position and type: ${analysis.lightSource}, direction: ${analysis.lightDirection}
- Background color and gradient: ${analysis.backgroundColor}
- Color temperature and tone: ${analysis.tone}
- Camera angle: ${analysis.cameraAngle}
- Composition and product placement: ${analysis.composition}
- Overall mood: ${analysis.mood}

CRITICAL REQUIREMENTS:
- ONLY the product from image 1 appears. No other products, bottles, or items.
- The product must look IDENTICAL to image 1 — preserve all details, labels, colors, shape exactly.
- The output must be a CLEAN product photo with NO text, NO badges, NO graphics — only the product on a styled background.
- Square (1:1) format for e-commerce thumbnail.
- Professional, high-end quality.`
    : `You are a professional product photographer. I am providing ONE product image (background removed).

Create a professional product photograph based on this style description:
${customStyle || "Clean, minimal white/light gray background with soft natural lighting from the upper left. Subtle shadow. Eye-level angle. High-end cosmetics brand feel."}

CRITICAL REQUIREMENTS:
- ONLY the provided product appears. No other products, bottles, or items.
- The product must look IDENTICAL to the input — preserve all details, labels, colors, shape exactly.
- The output must be a CLEAN product photo with NO text, NO badges, NO graphics.
- Square (1:1) format for e-commerce thumbnail.
- Professional, high-end quality.`;

    const productBase64 = productImage.replace(/^data:image\/\w+;base64,/, "");

    const parts: Array<Record<string, unknown>> = [
      { text: prompt },
      { inlineData: { mimeType: "image/png", data: productBase64 } },
    ];

    if (hasReference) {
      const referenceBase64 = referenceImage.replace(/^data:image\/\w+;base64,/, "");
      parts.push({ inlineData: { mimeType: "image/jpeg", data: referenceBase64 } });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K",
            },
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "이미지 생성 실패");
    }

    const images: string[] = [];
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData) {
          images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        }
      }
    }

    if (images.length === 0) {
      throw new Error("이미지가 생성되지 않았습니다. 다시 시도해주세요.");
    }

    return NextResponse.json({ images });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
