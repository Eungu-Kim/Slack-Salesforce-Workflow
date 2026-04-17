const { safe } = require("../utils/format.util");

// Case 처리 Email 전송 모달
function buildStartCaseModalView({
  caseId,
  channelId,
  caseNumber,
  defaultEmail,
  defaultSubject,
  defaultEmailBody
}) {
  return {
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
}

// 중복 병합 모달
function buildMergeModalView({ currentCase, duplicateResults }) {
  return {
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
}

module.exports = {
  buildStartCaseModalView,
  buildMergeModalView
};
