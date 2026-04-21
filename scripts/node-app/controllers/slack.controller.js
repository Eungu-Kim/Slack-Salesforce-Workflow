const axios = require("axios");
const { SF_BASE_URL } = require("../config/env");
const {
  getSalesforceAccessToken,
  updateCaseStatus,
  updateCaseMergedInto,
  sendCaseEmail,
  getCaseInfo,
  getCaseInfoNumber,
  getAccountInfo,
  getOpenCaseCount,
  getAccountRecordUrl
} = require("../services/salesforce.service");
const {
  getAgentforceAccessToken,
  startAgentforceSession,
  sendAgentforceMessage,
  extractDuplicateAnalysisFromAgentResponse,
  extractNextActionFromAgentResponse
} = require("../services/agentforce.service");
const {
  postSlackMessage,
  postToSlackResponseUrl,
  openSlackView
} = require("../services/slack.service");
const {
  buildAccountSlackMessage,
  buildDuplicateAnalysisSlackMessage,
  buildNoDuplicateCandidatesMessage,
  buildDuplicateParseErrorMessage,
  buildNoDuplicateResultsMessage,
  buildDuplicateAnalysisErrorMessage,
  buildCaseStartedMessage,
  buildCaseMergedMessage,
  buildNBASlackMessage
} = require("../builders/slack.message.builder");
const {
  buildStartCaseModalView,
  buildMergeModalView,
  buildMergeConfirmModalView
} = require("../builders/slack.modal.builder");
const { text, response } = require("express");

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
          console.log("[Account] view_account 처리 시작", { caseId, accountId });
          const account = await getAccountInfo(accountId);
          console.log("[Account] getAccountInfo 완료", JSON.stringify(account, null, 2));

          const openCaseCount = await getOpenCaseCount(accountId);
          console.log("[Account] getOpenCaseCount 완료", openCaseCount);

          const messagePayload = buildAccountSlackMessage({
            account,
            openCaseCount,
            accountRecordUrl: getAccountRecordUrl(account.Id)
          });
          console.log("[Account] Slack 메시지 payload 생성 완료", JSON.stringify(messagePayload, null, 2));

          const result = await postSlackMessage({
            channel: payload.channel.id,
            payload: messagePayload
          });
          console.log("[Account] Slack 전송 응답:", JSON.stringify(result, null, 2));
        } catch (error) {
          console.error("[Account] 에러 메시지:", error.message);
          console.error("[Account] 에러 응답:", JSON.stringify(error.response?.data, null, 2));
        }

        return;
      }

      // Case 처리 시작
      if (actionId === "start_case") {
        const parts = value.split("|");
        const caseId = parts[1] || "";
        const caseRecord = await getCaseInfo(caseId);
        const caseNumber = caseRecord.CaseNumber;
        const defaultEmail = caseRecord?.ContactEmail || "";
        const defaultSubject = "[Salesforce Customer Support] 문의 접수 안내";
        const defaultEmailBody =
          `안녕하세요, 고객님.\n\n문의( Case ${caseNumber} )에 담당자가 배치되었습니다.\n빠르게 해결 후 답변드리겠습니다.\n\n감사합니다.\n고객지원팀 드림`;

        const view = buildStartCaseModalView({
          caseId,
          channelId: payload.channel.id,
          caseNumber,
          defaultEmail,
          defaultSubject,
          defaultEmailBody
        });

        await openSlackView({
          triggerId: payload.trigger_id,
          view
        });
        return res.status(200).send("ok");
      }

      // 중복 여부 확인
      if (actionId === "check_duplicate") {
        await postToSlackResponseUrl({
          responseUrl: payload.response_url,
          payload: {
          response_type: "in_channel",
          replace_original: false,
          text: "🔍 중복 분석 중입니다... 완료 후 결과를 안내드립니다."
          }
        });

        const caseId = value.split("|")[1] || "";
        console.log("[Duplicate] 중복 확인 시작 caseId:", caseId);

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

          console.log("[Duplicate] 후보 조회 결과:", JSON.stringify(sfResponse.data, null, 2));
          const { currentCase, candidates } = sfResponse.data;

          if (!candidates || !candidates.length) {
            await postToSlackResponseUrl({
              responseUrl: payload.response_url,
              payload: buildNoDuplicateCandidatesMessage()
            });
            return;
          }

          const accessToken = await getAgentforceAccessToken();
          console.log("[Duplicate] Agentforce access token 발급 완료");

          const session = await startAgentforceSession(accessToken);
          console.log("[Duplicate] Agent session 시작 응답:", JSON.stringify(session, null, 2));

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

          console.log("[Duplicate] Agent 중복 분석 응답:", JSON.stringify(agentResponse, null, 2));

          const parsedResult = extractDuplicateAnalysisFromAgentResponse(agentResponse);

          if (!parsedResult || !parsedResult.results || !parsedResult.results.length) {
            await postToSlackResponseUrl({
              responseUrl: payload.response_url,
              payload: buildDuplicateParseErrorMessage()
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
            await postToSlackResponseUrl({
              responseUrl: payload.response_url,
              payload: buildNoDuplicateResultsMessage({ currentCase })
            });
            return;
          }

          const recommendedMaster = selectRecommendedMasterCase(candidates, duplicateResults);
          const resultPayload = buildDuplicateAnalysisSlackMessage({
            currentCase,
            duplicateResults,
            recommendedMaster
          });

          await postToSlackResponseUrl({
            responseUrl: payload.response_url,
            payload: resultPayload
          });
        } catch (error) {
          console.error("[Duplicate] 에러 메시지:", error.message);
          console.error("[Duplicate] 에러 응답:", JSON.stringify(error.response?.data, null, 2));

          await postToSlackResponseUrl({
            responseUrl: payload.response_url,
            payload: buildDuplicateAnalysisErrorMessage({
              errorMessage: error.message
            })
          });
        }

        return;
      }

      // 병합 모달 오픈
      if (actionId === "open_merge_modal") {
        try {
          const data = JSON.parse(value);

          const view = buildMergeModalView({
            currentCase: data.currentCase,
            duplicateResults: data.duplicateResults,
            channelId: payload.channel.id
          });
          await openSlackView({
            triggerId: payload.trigger_id,
            view
          });
          return res.status(200).send("ok");
        } catch (error) {
          console.error("[Merge] 에러 메시지:", error.message);
          console.error("[Merge] 에러 응답:", JSON.stringify(error.response?.data, null, 2));
          return res.status(500).send("open_merge_modal error");
        }
      }

      // Agent 다음 행동 추천
      if (actionId === "recommend_next_action") {
        console.log("[NextAction] recommend_next_action 처리 시작");

        await postToSlackResponseUrl({
          responseUrl: payload.response_url,
          payload: {
            response_type: "in_channel",
            replace_original: false,
            text: "🤖 다음 행동을 분석 중입니다... 완료 후 결과를 안내드립니다."
          }
        });

        res.status(200).send("ok");

        try {
          console.log("요청 payload 파싱 시작");
          const data = JSON.parse(value || "{}");
          const currentCaseFromSlack = data.currentCase || {};
          const caseId = currentCaseFromSlack.id || "";

          if (!caseId) {
            throw new Error("currentCase.id가 없습니다");
          }

          console.log("대상 caseId:", caseId);

          const currentCase = await getCaseInfo(caseId);
          console.log("[NextAction] Case 조회 완료:", JSON.stringify(currentCase, null, 2));

          let openCaseCount = null;
          if (currentCase?.AccountId) {
            openCaseCount = await getOpenCaseCount(currentCase.AccountId);
          }
          console.log("[NextAction] Open Case 건수:", openCaseCount);

          const accessToken = await getAgentforceAccessToken();
          console.log("[NextAction] Agentforce access token 발급 완료");

          const session = await startAgentforceSession(accessToken);
          console.log("[NextAction] Agent session 시작 응답:", JSON.stringify(session, null, 2));

          const sessionId =
            session?.sessionId ||
            session?.id ||
            session?.session?.id ||
            session?.conversationId;

          if (!sessionId) {
            throw new Error(`Agentforce sessionId를 찾지 못했습니다. response=${JSON.stringify(session)}`);
          }

          console.log("[NextAction] sessionId:", sessionId);

          const prompt = `Use the Case Next Best Action Flow and return JSON only.

          currentCase:
          ${JSON.stringify(currentCase)}

          accountSummary:
          null

          openCaseCount:
          ${openCaseCount === null ? "null" : openCaseCount}

          duplicateSummary:
          null`;

          console.log("Agent 요청 프롬프트:", prompt);

          const agentResponse = await sendAgentforceMessage(
            accessToken,
            sessionId,
            prompt
          );

          console.log("Agent raw message:", agentResponse?.messages?.[0]?.message);

          console.log("Agent 응답 원본:", JSON.stringify(agentResponse, null, 2));

          const parsedResult = extractNextActionFromAgentResponse(agentResponse);
          console.log("파싱 결과:", JSON.stringify(parsedResult, null, 2));

          if (!parsedResult) {
            throw new Error("Agent 응답에서 유효한 JSON 결과를 추출하지 못했습니다.");
          }

          const messagePayload = buildNBASlackMessage({
            result: parsedResult
          });
          console.log("Slack 메시지 payload:", JSON.stringify(messagePayload, null, 2));

          const slackResult = await postSlackMessage({
            channel: payload.channel.id,
            payload: messagePayload
          });
          console.log("Slack 전송 응답:", JSON.stringify(slackResult, null, 2));

          return;
        } catch (error) {
          console.error("[NextAction] 에러 메시지:", error.message);
          console.error("[NextAction] 에러 스택:", error.stack);
          console.error("[NextAction] 에러 응답:", JSON.stringify(error.response?.data, null, 2));

          await postToSlackResponseUrl({
            responseUrl: payload.response_url,
            payload: {
              response_type: "in_channel",
              replace_original: false,
              text: "다음 행동 추천 중 오류가 발생했습니다.",
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: "⚠️ 다음 행동 추천 오류"
                  }
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `오류 메시지: \`${error.message}\``
                  }
                }
              ]
            }
          });

          return;
        }
      }

      return res.status(200).send("ok");
    }

    // Case 시작 이메일 전송 완료 메세지
    if (payload.type === "view_submission") {
      const callbackId = payload.view?.callback_id;
      const privateMetadata = payload.view?.private_metadata || "";

      if (callbackId === "start_case_modal") {
        console.log("[StartCase] submission start");
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
        const subject = caseRecord?.Subject || "";
  
        const messagePayload = buildCaseStartedMessage({
          caseId,
          caseNumber,
          subject,
          emailTo,
          caseRecordUrl: `${SF_BASE_URL}/lightning/r/Case/${caseId}/view`
        });
        await postSlackMessage({
          channel: channelId,
          payload: messagePayload
        });
  
        return;
      }

      if (callbackId === "merge_case_modal") {
        const meta = JSON.parse(privateMetadata || "{}");
        const {
          currentCaseId,
          currentCaseNumber,
          currentCaseSubject,
          channelId
        } = meta;

        const values = payload.view?.state?.values || {};

        const masterCaseNumber = values.master_case_block?.master_case_select?.selected_option?.value || "";
        const masterCaseText = values.master_case_block?.master_case_select?.selected_option?.text?.text || "";
        
        if (!masterCaseNumber) {
          return res.status(200).json({
            response_action: "errors",
            errors: {
              master_case_block: "Master Case를 선택해주세요."
            }
          });
        }

        return res.status(200).json({
          response_action: "update",
          view: buildMergeConfirmModalView({
            currentCaseId,
            currentCaseNumber,
            currentCaseSubject,
            masterCaseNumber,
            masterCaseText,
            channelId
          })
        });
      }

      if (callbackId === "merge_case_confirm_modal") {
        const [currentCaseId, masterCaseNumber, channelId] = (payload.view?.private_metadata || "").split("|");

        res.status(200).json({ response_action: "clear"});
        
        try {
          const currentCase = await getCaseInfo(currentCaseId);
          const masterCase = await getCaseInfoNumber(masterCaseNumber);

          await updateCaseStatus(currentCaseId, "Merged");
          await updateCaseMergedInto(currentCaseId, masterCase.Id);

          const messagePayload = buildCaseMergedMessage({
            currentCase: {
              caseNumber: currentCase.CaseNumber,
              subject: currentCase.Subject,
              status: "Merged"
            },
            masterCase: {
              caseNumber: masterCase.CaseNumber,
              subject: masterCase.Subject,
              status: masterCase.Status
            },
            currentCaseRecordUrl: `${SF_BASE_URL}/lightning/r/Case/${currentCaseId}/view`,
            msCaseRecordUrl: `${SF_BASE_URL}/lightning/r/Case/${masterCase.Id}/view`
          });
          await postSlackMessage({
            channel: channelId,
            payload: messagePayload
          });

          return;
        } catch (error) {
          console.log("[Merge Confirm] 에러 메시지:", error.message);
          console.error("[Merge Confirm] 에러 응답:", JSON.stringify(error.response?.data, null, 2));
          return;
        }
      }
    }

    return res.status(200).send("ok");
  } catch (error) {
    console.error("처리 중 에러:", error.response?.data || error.message);
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
