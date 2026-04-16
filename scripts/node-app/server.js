console.log("NEW SERVER.JS LOADED");

require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const SF_BASE_URL = process.env.SF_BASE_URL;
const SF_API_VERSION = process.env.SF_API_VERSION || "v62.0";
const SF_ACCESS_TOKEN = process.env.SF_ACCESS_TOKEN;

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

    if (payload.type === "block_actions") {
        const action = payload.actions && payload.actions[0];
        if (!action) {
            return res.status(400).send("No action found");
        }

        const actionId = action.action_id;
        const value = action.value || "";
        console.log("actionId:", actionId);
        console.log("value:", value);

        if (actionId === "start_case") {
            await openStartCaseModal(payload.trigger_id, value, payload.channel.id);
            return res.status(200).send("ok");
        }

        if (actionId === "view_account") {
            const parts = value.split("|");
            const caseId = parts[1] || "";
            const accountId = parts[2] || "";

            res.status(200).send("ok");
            
            try {
                console.log("view_account 시작", { caseId, accountId });
                const account = await getAccountInfo(accountId);
                console.log("getAccountInfo 성공" + JSON.stringify(account, null, 2));

                const openCaseCount = await getOpenCaseCount(accountId);
                console.log("getOpenCaseCount 성공" + openCaseCount);

                const messagePayload = buildAccountSlackMessage(account, openCaseCount);
                console.log("buildAccountSlackMessage 성공" + JSON.stringify(messagePayload, null, 2));

                const result = await postSlackMessage(payload.channel.id, messagePayload);
                console.log("postSlackMessage respose: " + JSON.stringify(result, null, 2));
            } catch (error) {
                console.error("view_account 에러 메세지 " + error.message);
                console.error("view_account 에러 response " + JSON.stringify(error.response?.data, null, 2));
            }
            return;
        }

        if (actionId === "check_duplicate") {
          const caseId = value.split("|")[1];

          console.log("중복여부 확인 시작", caseId);
        
          try {
            const response = await axios.post(
              `${SF_BASE_URL}/services/apexrest/case-duplicate/candidates`,
              { caseId },
              {
                headers: {
                  Authorization: `Bearer ${SF_ACCESS_TOKEN}`,
                  "Content-Type": "application/json"
                }
              }
            );
        
            console.log("후보 조회 결과:", JSON.stringify(response.data, null, 2));
        
          } catch (error) {
            console.error("후보 조회 에러:", error.message);
            console.error("response:", error.response?.data);
          }
        
          return res.status(200).send();
        }

        return res.status(200).send("ok");
    }

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
    text: "Case 처리 완료", // fallback
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
            text: `*Case Number:*\n${caseNumber}`
          },
          {
            type: "mrkdwn",
            text: `*Status:*\nWorking`
          },
          {
            type: "mrkdwn",
            text: `*수신자:*\n${emailTo}`
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

async function openStartCaseModal(triggerId, buttonValue, channelId) {
  const parts = buttonValue.split("|");
  const caseId = parts[1] || "";

  const caseRecord = await getCaseInfo(caseId);
  const caseNumber = caseRecord.CaseNumber;
  const defaultEmail = getDefaultCustomerEmail(caseRecord);
  const defaultSubject = `[Salesforce Customer Support] 문의 접수 안내`;
  const defaultEmailBody = `안녕하세요, 고객님.\n\n문의( Case ${caseNumber} )에 담당자가 배치되었습니다.\n빠르게 해결 후 답변드리겠습니다.\n\n감사합니다.\n고객지원팀 드림`

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

  console.log("sendCaseEmail response: " + response.status, response.data);
}

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

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

function safe(value) {
  return value && String(value).trim() ? value : "-";
}

function getAccountRecordUrl(accountId) {
  return `${SF_BASE_URL}/lightning/r/Account/${accountId}/view`;
}