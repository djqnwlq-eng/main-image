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
    const { productImage, analysis } = await request.json();

    const prompt = `You are a professional product photographer. I am providing ONE product image (with background removed). Create a completely NEW product photograph featuring ONLY this product.

DO NOT copy or reference any other product. The scene must contain ONLY the provided product — no other cosmetic items, bottles, tubes, or packages.

Create a new styled background and environment from scratch based on these style directions:

Background: ${analysis.backgroundColor}
Color Temperature & Tone: ${analysis.tone}
Props & Decorative Elements: ${analysis.structures}
Shadow Style: ${analysis.shadow}
Lighting Setup: ${analysis.lightSource}
Light Direction: ${analysis.lightDirection}
Color Palette: ${analysis.colorPalette}
Composition: ${analysis.composition}
Camera Angle: ${analysis.cameraAngle}
Overall Mood: ${analysis.mood}

CRITICAL REQUIREMENTS:
- ONLY the provided product appears in the image. No other products whatsoever.
- The product must look IDENTICAL to the input — preserve all details, labels, colors, shape exactly.
- Create a brand new background/scene inspired by the style description above.
- Square (1:1) format for e-commerce smart store thumbnail.
- Professional, high-end quality comparable to luxury Korean cosmetics brands.
- Natural lighting on the product matching the environment.`;

    const productBase64 = productImage.replace(/^data:image\/\w+;base64,/, "");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: productBase64
                }
              }
            ]
          }],
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
