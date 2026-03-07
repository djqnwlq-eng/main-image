import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

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
    const { referenceImage } = await request.json();
    const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, "");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `이 레퍼런스 상품 사진을 상세히 분석해주세요. 다른 상품에 동일한 스타일을 적용하기 위한 분석입니다.

반드시 아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이 JSON만):

{
  "backgroundColor": "배경의 주요 색상, 그라데이션 여부, 패턴 상세 설명",
  "tone": "전체적인 색온도(웜/쿨/뉴트럴), 명도, 채도 수준",
  "structures": "배경에 있는 오브젝트, 소품, 장식 요소 상세 설명",
  "shadow": "그림자의 방향, 강도, 확산 정도, 종류(소프트/하드)",
  "lightSource": "광원의 위치, 개수, 종류(자연광/인공광/스튜디오)",
  "lightDirection": "메인 라이트와 보조 라이트의 방향",
  "colorPalette": "전체 컬러 팔레트, 포인트 컬러, 지배적인 색조",
  "composition": "상품 배치(중앙/오프셋), 여백 비율, 삼분법 활용",
  "cameraAngle": "촬영 각도(탑뷰/아이레벨/로우앵글 등)",
  "mood": "전체적인 분위기(고급감/내추럴/클린/미니멀 등)"
}

각 항목을 구체적이고 상세하게 작성해주세요.`
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "분석 실패");
    }

    const text = data.candidates[0].content.parts[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("분석 결과 파싱 실패");

    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
