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

// 병합 Master 선택 모달
function buildMergeModalView({ currentCase, duplicateResults, channelId }) {
  return {
    type: "modal",
    callback_id: "merge_case_modal",
    private_metadata: JSON.stringify({
      currentCaseId: currentCase.id,
      currentCaseNumber: currentCase.caseNumber,
      currentCaseSubject: currentCase.subject,
      channelId
    }),
    title: {
      type: "plain_text",
      text: "케이스 병합"
    },
    submit: {
      type: "plain_text",
      text: "다음"
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
        block_id: "master_case_block",
        label: {
          type: "plain_text",
          text: "Master Case 선택"
        },
        element: {
          type: "static_select",
          action_id: "master_case_select",
          placeholder: {
            type: "plain_text",
            text: "Master Case를 선택하세요"
          },
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

// 병합 실행 확인 모달
function buildMergeConfirmModalView({
  currentCaseId,
  currentCaseNumber,
  currentCaseSubject,
  masterCaseNumber,
  masterCaseText,
  channelId
}) {
  return {
    type: "modal",
    callback_id: "merge_case_confirm_modal",
    private_metadata: `${currentCaseId}|${masterCaseNumber}|${channelId}`,
    title: {
      type: "plain_text",
      text: "병합 확인"
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
          text:
            `*진짜 병합하시겠습니까?*\n` +
            `*현재 Case의 상태가 Merged로 변경됩니다.*`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `현재 Case 정보:\nCase ${safe(currentCaseNumber)} - ${safe(currentCaseSubject)}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `선택한 Master Case 정보:\n${safe(masterCaseText)}`
        }
      }
    ]
  };
}

module.exports = {
  buildStartCaseModalView,
  buildMergeModalView,
  buildMergeConfirmModalView
};
