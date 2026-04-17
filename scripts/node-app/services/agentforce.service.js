const axios = require("axios");
const crypto = require("crypto");
const {
  AGENTFORCE_BASE_URL,
  AGENTFORCE_MY_DOMAIN_URL,
  AGENTFORCE_CLIENT_ID,
  AGENTFORCE_CLIENT_SECRET,
  AGENTFORCE_AGENT_ID
} = require("../config/env");

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

  try {
    return JSON.parse(lastText);
  } catch (e) {
    const jsonMatch = lastText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("Agent 응답 텍스트에서 JSON 블록을 찾지 못했습니다.");
      return null;
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (innerError) {
      console.warn("Agent 응답 JSON 파싱 실패:", innerError.message);
      return null;
    }
  }
}

module.exports = {
  getAgentforceAccessToken,
  startAgentforceSession,
  sendAgentforceMessage,
  extractDuplicateAnalysisFromAgentResponse
};
