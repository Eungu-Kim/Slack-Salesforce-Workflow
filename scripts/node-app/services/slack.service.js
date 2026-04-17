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

module.exports = {
  postSlackMessage,
  postToSlackResponseUrl,
  openSlackView
};
