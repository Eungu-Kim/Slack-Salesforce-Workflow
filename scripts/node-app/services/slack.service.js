const axios = require("axios");
const { SLACK_BOT_TOKEN } = require("../config/env");

// Slack 메세지 POST
async function postSlackMessage({ channel, payload }) {
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

// Slack 인터렉션 후속 메세지 POST
async function postToSlackResponseUrl({ responseUrl, payload }) {
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

// 모달 오픈 -> triggerd_id(몇 초안에 만료)
async function openSlackView({ triggerId, view }) {
  const response = await axios.post(
    "https://slack.com/api/views.open",
    {
      trigger_id: triggerId,
      view
    },
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );

  console.log("views.open response:", response.data);
  return response.data;
}

// DM 오픈 -> DM Channel id return
async function openDmConversation(slackUserId) {
  const response = await axios.post(
    "https://slack.com/api/conversations.open",
    {
      users: slackUserId
    },
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );

  console.log("conversations.open response:", JSON.stringify(response.data, null, 2));
  if (!response.data.ok) {
    throw new Error(`Slack DM 오픈 실패: ${response.data.error}`);
  }

  return response.data.channel?.id;
}

// Slack User Email 조회
async function getEmailFromSlack(slackUserId) {
  const response = await axios.get(
    "https://slack.com/api/users.profile.get",
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      params: {
        user: slackUserId
      }
    }
  );

  console.log("users.profile.get response:", JSON.stringify(response.data, null, 2));
  if (!response.data.ok) {
    throw new Error(`Slack User Email 조회 실패: ${response.data.error}`);
  }
  return response.data.profile?.email || "";
}

module.exports = {
  postSlackMessage,
  postToSlackResponseUrl,
  openSlackView,
  openDmConversation,
  getEmailFromSlack
};
