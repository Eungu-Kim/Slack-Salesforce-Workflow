console.log("NEW SERVER.JS LOADED");

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const SF_BASE_URL = process.env.SF_BASE_URL;
const SF_API_VERSION = process.env.SF_API_VERSION || "v62.0";
const SF_ACCESS_TOKEN = process.env.SF_ACCESS_TOKEN;

const AGENTFORCE_BASE_URL = process.env.AGENTFORCE_BASE_URL;
const AGENTFORCE_MY_DOMAIN_URL = process.env.AGENTFORCE_MY_DOMAIN_URL;
const AGENTFORCE_CLIENT_ID = process.env.AGENTFORCE_CLIENT_ID;
const AGENTFORCE_CLIENT_SECRET = process.env.AGENTFORCE_CLIENT_SECRET;
const AGENTFORCE_AGENT_ID = process.env.AGENTFORCE_AGENT_ID;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Slack Salesforce bot server is running.");
});

app.post("/slack/interactions", async (req, res) => {
  try {
    if (!req.body.payload) {
      return res.status(400).send("Missing payload");
    }

    const payload = JSON.parse(req.body.payload);
    console.log("받은 Slack payload:");
    console.log(JSON.stringify(payload, null, 2));

    // 버튼 액션 처리
    if (payload.type === "block_actions") {
      const action = payload.actions && payload.actions[0];
      if (!action) {
        return res.status(400).send("No action found");
      }

      const actionId = action.action_id;
      const value = action.value || "";
      console.log("actionId:", actionId);
      console.log("value:", value);

      // 1) Case 처리 시작
      if (actionId === "start_case") {
        await openStartCaseModal(payload.trigger_id, value, payload.channel.id);
        return res.status(200).send("ok");
      }

      // 2) 고객 정보 보기
      if (actionId === "view_account") {
        const parts = value.split("|");
        const caseId = parts[1] || "";
        const accountId = parts[2] || "";

        // Slack 3초 제한 대응: 먼저 응답
        res.status(200).send("ok");

        try {
          console.log("view_account 시작", { caseId, accountId });

          const account = await getAccountInfo(accountId);
          console.log("getAccountInfo 성공", JSON.stringify(account, null, 2));

          const openCaseCount = await getOpenCaseCount(accountId);
          console.log("getOpenCaseCount 성공", openCaseCount);

          const messagePayload = buildAccountSlackMessage(account, openCaseCount);
          console.log("buildAccountSlackMessage 성공", JSON.stringify(messagePayload, null, 2));

          const result = await postSlackMessage(payload.channel.id, messagePayload);
          console.log("postSlackMessage response:", JSON.stringify(result, null, 2));
        } catch (error) {
          console.error("view_account 에러 message:", error.message);
          console.error("view_account 에러 response:", JSON.stringify(error.response?.data, null, 2));
        }

        return;
      }

      // 3) 중복 여부 확인
      if (actionId === "check_duplicate") {
        await postToSlackResponseUrl(payload.response_url, {
          response_type: "in_channel",
          replace_original: false,
          text: "🔍 중복 분석 중입니다... 완료 후 결과를 안내드립니다."
        });

        const caseId = value.split("|")[1] || "";
        console.log("중복여부 확인 시작", caseId);

        // Slack은 3초 이내 응답 필요
        res.status(200).send("ok");

        try {
          const sfResponse = await axios.post(
            `${SF_BASE_URL}/services/apexrest/case-duplicate/candidates`,
            { caseId },
            {
              headers: {
                Authorization: `Bearer ${SF_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
              }
            }
          );

          console.log("후보 조회 결과:", JSON.stringify(sfResponse.data, null, 2));

          const { currentCase, candidates } = sfResponse.data;

          if (!candidates || !candidates.length) {
            await postToSlackResponseUrl(payload.response_url, {
              response_type: "in_channel",
              replace_original: false,
              text: "중복 분석 결과: 후보 케이스가 없습니다.",
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: "🔍 중복 분석 결과"
                  }
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: "현재 조건에 맞는 후보 케이스가 없습니다."
                  }
                }
              ]
            });
            return;
          }

          const accessToken = await getAgentforceAccessToken();
          console.log("Agentforce access token 발급 성공");

          const session = await startAgentforceSession(accessToken);
          console.log("Agent session 시작 결과:", JSON.stringify(session, null, 2));

          const sessionId = session.sessionId;

          const agentResponse = await sendAgentforceMessage(
            accessToken,
            sessionId,
            `Use the Case Duplication in Slack template and return JSON only.
          
          currentCase:
          ${JSON.stringify(currentCase)}
          
          candidates:
          ${JSON.stringify(candidates)}`
          );

          console.log("Agent 중복 분석 결과:", JSON.stringify(agentResponse, null, 2));

          const parsedResult = extractDuplicateAnalysisFromAgentResponse(agentResponse);

          if (!parsedResult || !parsedResult.results || !parsedResult.results.length) {
            await postToSlackResponseUrl(payload.response_url, {
              response_type: "in_channel",
              replace_original: false,
              text: "중복 분석 결과를 파싱하지 못했습니다.",
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: "⚠️ 중복 분석 실패"
                  }
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: "Agent 응답에서 유효한 JSON 결과를 추출하지 못했습니다."
                  }
                }
              ]
            });
            return;
          }

          const duplicateResults = parsedResult.results
          .filter((item) => item.isDuplicate === true)
          .map((item) => {
            const matchedCandidate = candidates.find(
              (candidate) => candidate.caseNumber === item.caseNumber
            );
        
            return {
              ...item,
              subject: matchedCandidate?.subject || "-"
            };
          });

          if (!duplicateResults.length) {
            await postToSlackResponseUrl(payload.response_url, {
              response_type: "in_channel",
              replace_original: false,
              text: "중복 가능 케이스가 없습니다.",
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: "✅ 중복 분석 완료"
                  }
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*Case ${safe(currentCase.caseNumber)}* 기준으로 중복 가능 케이스가 발견되지 않았습니다.`
                  }
                }
              ]
            });
            return;
          }

          const recommendedMaster = selectRecommendedMasterCase(candidates, duplicateResults);

          const resultPayload = buildDuplicateAnalysisSlackMessage(
            currentCase,
            duplicateResults,
            recommendedMaster
          );

          await postToSlackResponseUrl(payload.response_url, resultPayload);
        } catch (error) {
          console.error("중복 분석 에러 message:", error.message);
          console.error("중복 분석 에러 response:", JSON.stringify(error.response?.data, null, 2));

          await postToSlackResponseUrl(payload.response_url, {
            response_type: "in_channel",
            replace_original: false,
            text: "중복 분석 중 오류가 발생했습니다.",
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "⚠️ 중복 분석 오류"
                }
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `오류 메시지: \`${safe(error.message)}\``
                }
              }
            ]
          });
        }

        return;
      }

      // 4) 중복 Case 병합하기
      if (actionId === "open_merge_modal") {
        try {
          const data = JSON.parse(value);

          await openMergeModal(payload.trigger_id, data);

          return res.status(200).send("ok");
        } catch (error) {
          console.error("open_merge_modal 에러 message:", error.message);
          console.error("open_merge_modal 에러 response:", JSON.stringify(error.response?.data, null, 2));
          return res.status(500).send("open_merge_modal error");
        }
      }
      return res.status(200).send("ok");
    }

    // Case 처리 시작 모달 제출
    if (payload.type === "view_submission") {
      console.log("view_submission new code");

      const callbackId = payload.view?.callback_id;
      if (callbackId !== "start_case_modal") {
        return res.status(200).json({ response_action: "clear" });
      }

      const privateMetadata = payload.view?.private_metadata || "";
      const [caseId, channelId] = privateMetadata.split("|");

      const values = payload.view?.state?.values || {};
      const emailTo = values.email_block?.email_input?.value || "";
      const emailSubject = values.subject_block?.subject_input?.value || "";
      const emailBody = values.body_block?.body_input?.value || "";

      res.status(200).json({ response_action: "clear" });

      await updateCaseStatus(caseId, "Working");
      await sendCaseEmail(caseId, emailTo, emailSubject, emailBody);

      const caseRecord = await getCaseInfo(caseId);
      const caseNumber = caseRecord.CaseNumber;

      await postSlackMessage(channelId, {
        text: "Case 처리 완료",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "✅ Case 시작 이메일 전송 완료"
            }
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Case Number:*\n${safe(caseNumber)}`
              },
              {
                type: "mrkdwn",
                text: "*Status:*\nWorking"
              },
              {
                type: "mrkdwn",
                text: `*수신자:*\n${safe(emailTo)}`
              }
            ]
          },
          {
            type: "divider"
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Salesforce에서 보기"
                },
                url: `${SF_BASE_URL}/lightning/r/Case/${caseId}/view`
              }
            ]
          }
        ]
      });

      return;
    }

    return res.status(200).send("ok");
  } catch (error) {
    console.error("에러 발생:", error.response?.data || error.message);
    if (!res.headersSent) {
      return res.status(500).send("Server error");
    }
  }
});

// ------------------------------------
// Slack - Case 처리 시작 모달
// ------------------------------------
async function openStartCaseModal(triggerId, buttonValue, channelId) {
  const parts = buttonValue.split("|");
  const caseId = parts[1] || "";

  const caseRecord = await getCaseInfo(caseId);
  const caseNumber = caseRecord.CaseNumber;
  const defaultEmail = getDefaultCustomerEmail(caseRecord);
  const defaultSubject = "[Salesforce Customer Support] 문의 접수 안내";
  const defaultEmailBody =
    `안녕하세요, 고객님.\n\n문의( Case ${caseNumber} )에 담당자가 배치되었습니다.\n빠르게 해결 후 답변드리겠습니다.\n\n감사합니다.\n고객지원팀 드림`;

  const modalView = {
    type: "modal",
    callback_id: "start_case_modal",
    private_metadata: `${caseId}|${channelId}`,
    title: {
      type: "plain_text",
      text: "Case 처리 시작"
    },
    submit: {
      type: "plain_text",
      text: "보내기"
    },
    close: {
      type: "plain_text",
      text: "취소"
    },
    blocks: [
      {
        type: "input",
        block_id: "email_block",
        label: {
          type: "plain_text",
          text: "고객 이메일"
        },
        element: {
          type: "plain_text_input",
          action_id: "email_input",
          placeholder: {
            type: "plain_text",
            text: "customer@example.com"
          },
          initial_value: defaultEmail
        }
      },
      {
        type: "input",
        block_id: "subject_block",
        label: {
          type: "plain_text",
          text: "이메일 제목"
        },
        element: {
          type: "plain_text_input",
          action_id: "subject_input",
          initial_value: defaultSubject
        }
      },
      {
        type: "input",
        block_id: "body_block",
        label: {
          type: "plain_text",
          text: "고객에게 보낼 내용"
        },
        element: {
          type: "plain_text_input",
          action_id: "body_input",
          multiline: true,
          initial_value: defaultEmailBody
        }
      }
    ]
  };

  const response = await axios.post(
    "https://slack.com/api/views.open",
    {
      trigger_id: triggerId,
      view: modalView
    },
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );

  console.log("views.open response:", response.data);
}

// ------------------------------------
// Salesforce - Case / Account
// ------------------------------------
async function updateCaseStatus(caseId, status) {
  await axios.patch(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/sobjects/Case/${caseId}`,
    { Status: status },
    {
      headers: {
        Authorization: `Bearer ${SF_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function sendCaseEmail(caseId, toEmail, subject, body) {
  const response = await axios.post(
    `${SF_BASE_URL}/services/apexrest/case-email`,
    {
      caseId,
      toEmail,
      subject,
      body
    },
    {
      headers: {
        Authorization: `Bearer ${SF_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("sendCaseEmail response:", response.status, response.data);
}

async function getCaseInfo(caseId) {
  const response = await axios.get(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/query`,
    {
      headers: {
        Authorization: `Bearer ${SF_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      params: {
        q: `
          SELECT Id, CaseNumber, Subject, ContactEmail
          FROM Case
          WHERE Id = '${caseId}'
          LIMIT 1
        `.replace(/\s+/g, " ").trim()
      }
    }
  );

  const records = response.data.records || [];
  if (!records.length) {
    throw new Error("Case not found");
  }

  return records[0];
}

function getDefaultCustomerEmail(caseRecord) {
  return caseRecord?.ContactEmail || "";
}

async function getAccountInfo(accountId) {
  const response = await axios.get(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/query`,
    {
      headers: {
        Authorization: `Bearer ${SF_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      params: {
        q: `
          SELECT Id, Name, Industry, Owner.Name
          FROM Account
          WHERE Id = '${accountId}'
          LIMIT 1
        `.replace(/\s+/g, " ").trim()
      }
    }
  );

  const records = response.data.records || [];
  if (!records.length) {
    throw new Error("Account not found");
  }

  return records[0];
}

async function getOpenCaseCount(accountId) {
  const response = await axios.get(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/query`,
    {
      headers: {
        Authorization: `Bearer ${SF_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      params: {
        q: `
          SELECT COUNT()
          FROM Case
          WHERE AccountId = '${accountId}'
          AND IsClosed = false
        `.replace(/\s+/g, " ").trim()
      }
    }
  );

  return response.data.totalSize || 0;
}

// ------------------------------------
// Slack 공통
// ------------------------------------
async function postSlackMessage(channel, payload) {
  const response = await axios.post(
    "https://slack.com/api/chat.postMessage",
    {
      channel,
      ...payload
    },
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );

  console.log("postSlackMessage response:", JSON.stringify(response.data, null, 2));

  if (!response.data.ok) {
    throw new Error(`Slack post 실패: ${response.data.error}`);
  }

  return response.data;
}

async function postToSlackResponseUrl(responseUrl, payload) {
  if (!responseUrl) {
    console.warn("response_url이 없습니다. Slack 후속 응답을 보낼 수 없습니다.");
    return;
  }

  const response = await axios.post(responseUrl, payload, {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });

  console.log("postToSlackResponseUrl response:", response.status);
  return response.data;
}

function buildAccountSlackMessage(account, openCaseCount) {
  const summary =
    openCaseCount > 0
      ? `현재 *미해결 Case ${openCaseCount}건*이 있습니다. 중복 문의 여부를 확인해보세요.`
      : "현재 미해결 Case는 없습니다.";

  return {
    text: `고객 정보 - ${safe(account.Name)} / Industry: ${safe(account.Industry)} / Owner: ${safe(account.Owner?.Name)} / Open Cases: ${openCaseCount}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🏢 고객 정보"
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Account Name:*\n${safe(account.Name)}`
          },
          {
            type: "mrkdwn",
            text: `*Industry:*\n${safe(account.Industry)}`
          },
          {
            type: "mrkdwn",
            text: `*Owner:*\n${safe(account.Owner?.Name)}`
          },
          {
            type: "mrkdwn",
            text: `*Open Cases:*\n${openCaseCount}`
          }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: summary
        }
      },
      {
        type: "divider"
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Salesforce에서 보기",
              emoji: true
            },
            url: getAccountRecordUrl(account.Id)
          }
        ]
      }
    ]
  };
}

function buildDuplicateAnalysisSlackMessage(currentCase, duplicateResults, recommendedMaster) {
  const duplicateFields = duplicateResults.slice(0, 10).map((item) => ({
    type: "mrkdwn",
    text:
      `*Case ${safe(item.caseNumber)}*\n` +
      `${safe(item.issueSubcategory)} | score: ${safe(String(item.score))}\n` +
      `${safe(item.reason)}`
  }));

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🔍 중복 분석 결과"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*현재 Case:* ${safe(currentCase.caseNumber)}\n*Subject:* ${safe(currentCase.subject)}`
      }
    }
  ];

  if (recommendedMaster) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*추천 기준 Case*\n` +
          `Case ${safe(recommendedMaster.caseNumber)} | ${safe(recommendedMaster.status)}\n` +
          `${safe(recommendedMaster.createdDate)}\n` +
          `${safe(recommendedMaster.subject)}`
      }
    });
  }

  blocks.push({ type: "divider" });

  if (duplicateFields.length > 0) {
    blocks.push({
      type: "section",
      fields: duplicateFields
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        action_id: "open_merge_modal",
        text: {
          type: "plain_text",
          text: "병합하기"
        },
        style: "primary",
        value: JSON.stringify({
          currentCase: {
            id: currentCase.id,
            caseNumber: currentCase.caseNumber,
            subject: currentCase.subject
          },
          duplicateResults: duplicateResults.map((item) => ({
            caseNumber: item.caseNumber,
            subject: item.subject,
            issueSubcategory: item.issueSubcategory,
            score: item.score,
            reason: item.reason
          }))
        })
      }
    ]
  });

  return {
    response_type: "in_channel",
    replace_original: false,
    text: `중복 분석 완료 - 현재 Case ${safe(currentCase.caseNumber)}`,
    blocks
  };
}

// ------------------------------------
// Agentforce
// ------------------------------------
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

// ------------------------------------
// 중복 추천 기준 Case 선택
// ------------------------------------
function selectRecommendedMasterCase(candidates, duplicateResults) {
  const duplicateCaseNumbers = new Set(
    duplicateResults.map((item) => item.caseNumber)
  );

  const matchedCandidates = candidates.filter((candidate) =>
    duplicateCaseNumbers.has(candidate.caseNumber)
  );

  if (!matchedCandidates.length) {
    return null;
  }

  const workingCases = matchedCandidates
    .filter((c) => c.status === "Working")
    .sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate));

  if (workingCases.length) {
    return workingCases[0];
  }

  const newCases = matchedCandidates
    .filter((c) => c.status === "New")
    .sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate));

  return newCases.length ? newCases[0] : null;
}

// ------------------------------------
// 중복 Case 병합 로직
// ------------------------------------
async function openMergeModal(triggerId, data) {
  const { currentCase, duplicateResults } = data;

  const modal = {
    type: "modal",
    callback_id: "merge_modal",
    title: {
      type: "plain_text",
      text: "케이스 병합"
    },
    submit: {
      type: "plain_text",
      text: "병합 실행"
    },
    close: {
      type: "plain_text",
      text: "취소"
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*현재 Case:* ${currentCase.caseNumber}`
        }
      },

      // 병합 방식 선택 체크박스
      {
        type: "input",
        block_id: "merge_type_block",
        label: {
          type: "plain_text",
          text: "병합 방식"
        },
        element: {
          type: "static_select",
          action_id: "merge_type",
          options: [
            {
              text: { type: "plain_text", text: "현재 케이스만 병합" },
              value: "current_only"
            },
            {
              text: { type: "plain_text", text: "전체 병합" },
              value: "merge_all"
            }
          ]
        }
      },

      // 병합 대상 선택 체크박스
      {
        type: "input",
        block_id: "case_select_block",
        label: {
          type: "plain_text",
          text: "병합 대상 선택"
        },
        element: {
          type: "checkboxes",
          action_id: "selected_cases",
          options: duplicateResults.map(item => ({
            text: {
              type: "plain_text",
              text: `Case ${item.caseNumber} | ${safe(item.subject)} | score: ${item.score}`
            },
            value: item.caseNumber
          }))
        }
      }
    ]
  };

  await axios.post("https://slack.com/api/views.open", {
    trigger_id: triggerId,
    view: modal
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
}

// ------------------------------------
// 공통
// ------------------------------------
function safe(value) {
  return value && String(value).trim() ? value : "-";
}

function getAccountRecordUrl(accountId) {
  return `${SF_BASE_URL}/lightning/r/Account/${accountId}/view`;
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});