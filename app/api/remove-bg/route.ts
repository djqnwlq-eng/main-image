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
    const { image } = await request.json();
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: "Remove the background from this product image completely. Output ONLY the product on a pure white background. Keep the product exactly as is - same shape, colors, labels, and all details. The product should be centered. Do not add any shadows, reflections, or additional elements."
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
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
      throw new Error(data.error?.message || "배경 제거 실패");
    }

    let resultImage = null;
    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData) {
        resultImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!resultImage) {
      throw new Error("배경 제거된 이미지를 생성하지 못했습니다.");
    }

    return NextResponse.json({ image: resultImage });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
