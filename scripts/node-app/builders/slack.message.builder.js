const { safe, formatDate } = require("../utils/format.util");

// 고객 정보 보기
function buildAccountSlackMessage({
  account,
  openCaseCount,
  accountRecordUrl
}) {
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
            url: accountRecordUrl
          }
        ]
      }
    ]
  };
}

// 중복 분석 결과
function buildDuplicateAnalysisSlackMessage({
  currentCase,
  duplicateResults,
  recommendedMaster
}) {
  const duplicateFields = duplicateResults.slice(0, 10).map((item) => ({
    type: "mrkdwn",
    text:
      `Case ${safe(item.caseNumber)} - ${safe(item.subject)}\n` +
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
          text: "*후보 Case* (최대 6개 출력)"
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

// 중복 분석 결과(No Candidate)
function buildNoDuplicateCandidatesMessage() {
  return {
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
  };
}

// 중복 분석 결과(실패)
function buildDuplicateParseErrorMessage() {
  return {
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
  };
}

// 중복 분석 결과(No Duplication)
function buildNoDuplicateResultsMessage({ currentCase }) {
  return {
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
  };
}
// 중복 분석 결과(오류 발생)
function buildDuplicateAnalysisErrorMessage({ errorMessage }) {
  return {
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
          text: `오류 메시지: \`${safe(errorMessage)}\``
        }
      }
    ]
  };
}

// Case 처리 완료 후속 메세지지
function buildCaseStartedMessage({ caseNumber, emailTo, caseRecordUrl }) {
  return {
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
            url: caseRecordUrl
          }
        ]
      }
    ]
  };
}

module.exports = {
  buildAccountSlackMessage,
  buildDuplicateAnalysisSlackMessage,
  buildNoDuplicateCandidatesMessage,
  buildDuplicateParseErrorMessage,
  buildNoDuplicateResultsMessage,
  buildDuplicateAnalysisErrorMessage,
  buildCaseStartedMessage
};
