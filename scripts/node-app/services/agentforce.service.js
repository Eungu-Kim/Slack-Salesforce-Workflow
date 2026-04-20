const axios = require("axios");
const crypto = require("crypto");
const {
  AGENTFORCE_BASE_URL,
  AGENTFORCE_MY_DOMAIN_URL,
  AGENTFORCE_CLIENT_ID,
  AGENTFORCE_CLIENT_SECRET,
  AGENTFORCE_AGENT_ID
} = require("../config/env");

// Agent Access Token 발급
// 문제시 External Client App 확인
async function getAgentforceAccessToken() {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", AGENTFORCE_CLIENT_ID);
  params.append("client_secret", AGENTFORCE_CLIENT_SECRET);

  const response = await axios.post(
    `${AGENTFORCE_MY_DOMAIN_URL}/services/oauth2/token`,
    params,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return response.data.access_token;
}

// Agent Session 시작 후 Session Id 반환 가능
// Session은 Agent 활용 기능 수행 시 매번 초기화(재시작)
async function startAgentforceSession(accessToken) {
  const body = {
    externalSessionKey: crypto.randomUUID(),
    instanceConfig: {
      endpoint: AGENTFORCE_MY_DOMAIN_URL
    },
    streamingCapabilities: {
      chunkTypes: ["Text"]
    },
    bypassUser: true
  };

  const response = await axios.post(
    `${AGENTFORCE_BASE_URL}/einstein/ai-agent/v1/agents/${AGENTFORCE_AGENT_ID}/sessions`,
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}

// Agent에게 질문
// Session 초기화 후 첫 질문으로만 사용
async function sendAgentforceMessage(accessToken, sessionId, messageText) {
  const body = {
    message: {
      sequenceId: 1,
      type: "Text",
      text: messageText
    }
  };

  const response = await axios.post(
    `${AGENTFORCE_BASE_URL}/einstein/ai-agent/v1/sessions/${sessionId}/messages`,
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}

// 공통 JSON 파서
function parseJsonText(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// 중복 분석 결과 JSON만 뽑아내기
// Agent Prompt 상 결과는 JSON으로만 나오는 것이 맞으나, 오류 발생 + Null 대비
// Structured output으로 변경 후 results 배열 파싱
function extractDuplicateAnalysisFromAgentResponse(agentResponse) {
  const messages = agentResponse?.messages || [];
  const textCandidates = messages
    .map((msg) => msg?.message)
    .filter((msg) => typeof msg === "string" && msg.trim());

  if (!textCandidates.length) {
    console.warn("Agent 응답에서 message 텍스트를 찾지 못했습니다.");
    return null;
  }

  const lastText = textCandidates[textCandidates.length - 1];

  let parsed;
  try {
    parsed = JSON.parse(lastText);
  } catch (e) {
    const jsonMatch = lastText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("Agent 응답 텍스트에서 JSON 블록을 찾지 못했습니다.");
      return null;
    }

    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (innerError) {
      console.warn("Agent 응답 JSON 파싱 실패:", innerError.message);
      return null;
    }
  }

  // Structured output 대응
  if (parsed?.resultsJson && typeof parsed.resultsJson === "string") {
    try {
      parsed.results = JSON.parse(parsed.resultsJson);
    } catch (e) {
      console.warn("resultsJson 파싱 실패:", e.message);
      parsed.results = [];
    }
  }

  return parsed;
}

function extractNextActionFromAgentResponse(agentResponse) {
  const text =
    agentResponse?.messages?.[0]?.message ||
    agentResponse?.output ||
    agentResponse?.response ||
    "";

  const firstParsed = parseJsonText(text);
  if (!firstParsed) {
    return null;
  }

  // 바로 최종 JSON
  if (
    typeof firstParsed.recommendedAction === "string" &&
    typeof firstParsed.reason === "string"
  ) {
    return firstParsed;
  }

  // 2중 구조 { message: "{...}" }
  if (typeof firstParsed.message === "string") {
    return parseJsonText(firstParsed.message);
  }

  return null;
}

module.exports = {
  getAgentforceAccessToken,
  startAgentforceSession,
  sendAgentforceMessage,
  extractDuplicateAnalysisFromAgentResponse,
  extractNextActionFromAgentResponse
};
