const axios = require("axios");
const { SF_BASE_URL } = require("../config/env");
const { safe } = require("../utils/format.util");
const {
  getSalesforceAccessToken,
  updateCaseStatus,
  sendCaseEmail,
  getCaseInfo,
  getAccountInfo,
  getOpenCaseCount
} = require("../services/salesforce.service");
const {
  getAgentforceAccessToken,
  startAgentforceSession,
  sendAgentforceMessage,
  extractDuplicateAnalysisFromAgentResponse
} = require("../services/agentforce.service");
const {
  postSlackMessage,
  postToSlackResponseUrl,
  openStartCaseModal,
  openMergeModal,
  buildAccountSlackMessage,
  buildDuplicateAnalysisSlackMessage
} = require("../services/slack.service");

// 액션 별 기능 정의
// 버튼 기능: 고객 정보 보기, Case 처리 시작, 중복여부 확인, 병합하기기
// 후처리 기능: Case 시작 이메일 전송 완료
async function handleSlackInteractions(req, res) {
  try {
    if (!req.body.payload) {
      return res.status(400).send("Missing payload");
    }

    const payload = JSON.parse(req.body.payload);
    console.log("받은 Slack payload:");
    console.log(JSON.stringify(payload, null, 2));

    if (payload.type === "block_actions") {
      const action = payload.actions && payload.actions[0];
      if (!action) {
        return res.status(400).send("No action found");
      }

      const actionId = action.action_id;
      const value = action.value || "";
      console.log("actionId:", actionId);
      console.log("value:", value);

      // 고객 정보 보기
      if (actionId === "view_account") {
        const parts = value.split("|");
        const caseId = parts[1] || "";
        const accountId = parts[2] || "";

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

      // Case 처리 시작
      if (actionId === "start_case") {
        await openStartCaseModal(payload.trigger_id, value, payload.channel.id);
        return res.status(200).send("ok");
      }

      // 중복여부 확인
      if (actionId === "check_duplicate") {
        await postToSlackResponseUrl(payload.response_url, {
          response_type: "in_channel",
          replace_original: false,
          text: "🔍 중복 분석 중입니다... 완료 후 결과를 안내드립니다."
        });

        const caseId = value.split("|")[1] || "";
        console.log("중복여부 확인 시작", caseId);

        res.status(200).send("ok");

        try {
          const sfAccessToken = await getSalesforceAccessToken();
          const sfResponse = await axios.post(
            `${SF_BASE_URL}/services/apexrest/case-duplicate/candidates`,
            { caseId },
            {
              headers: {
                Authorization: `Bearer ${sfAccessToken}`,
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

          const sessionId =
            session?.sessionId ||
            session?.id ||
            session?.session?.id ||
            session?.conversationId;

          if (!sessionId) {
            throw new Error(`Agent sessionId를 찾지 못했습니다. response=${JSON.stringify(session)}`);
          }

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

      // 중복여부 확인 -> 병합하기
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

    // Case 시작 이메일 전송 완료 메세지
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
              text: "✅  Case 시작 이메일 전송 완료"
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
            type: "header",
            text: {
              type: "plain_text",
              text: "🤖  Agent 추천 다음 행동"
            }
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
}

// 후보 Case 선택
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

module.exports = {
  handleSlackInteractions
};
