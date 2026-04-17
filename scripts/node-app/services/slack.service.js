const axios = require("axios");
const { SLACK_BOT_TOKEN } = require("../config/env");
const { safe, formatDate } = require("../utils/format.util");
const { getCaseInfo, getAccountRecordUrl } = require("./salesforce.service");

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

function getDefaultCustomerEmail(caseRecord) {
  return caseRecord?.ContactEmail || "";
}

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
          text: `*현재 Case* ${safe(currentCase.caseNumber)} - ${safe(currentCase.subject)}`
        }
      },
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
              text: { type: "plain_text", text: "중복 후보 전체 병합" },
              value: "merge_all"
            }
          ]
        }
      },
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
          options: duplicateResults.map((item) => ({
            text: {
              type: "plain_text",
              text: `Case ${item.caseNumber} - ${safe(item.subject)} | score: ${item.score}`
            },
            value: item.caseNumber
          }))
        }
      }
    ]
  };

  await axios.post(
    "https://slack.com/api/views.open",
    {
      trigger_id: triggerId,
      view: modal
    },
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
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
  const duplicateFields = duplicateResults.slice(0, 8).map((item) => ({
    type: "mrkdwn",
    text:
      `*Case* ${safe(item.caseNumber)} - ${safe(item.subject)}\n` +
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
        text: `*현재 Case* ${safe(currentCase.caseNumber)} - ${safe(currentCase.subject)}`
      }
    }
  ];

  if (recommendedMaster) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*추천 기준 Case* ${safe(recommendedMaster.caseNumber)} - ${safe(recommendedMaster.subject)}\n` +
          `상태: ${safe(recommendedMaster.status)} | 생성일: ${formatDate(recommendedMaster.createdDate)}`
      }
    });
  }

  blocks.push({ type: "divider" });

  if (duplicateFields.length > 0) {
    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*후보 Case*"
        }
      },
      {
        type: "section",
        fields: duplicateFields
      }
    );
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

module.exports = {
  postSlackMessage,
  postToSlackResponseUrl,
  openStartCaseModal,
  openMergeModal,
  buildAccountSlackMessage,
  buildDuplicateAnalysisSlackMessage
};
