require("dotenv").config();

const env = {
  PORT: process.env.PORT || 3000,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SF_BASE_URL: process.env.SF_BASE_URL,
  SF_API_VERSION: process.env.SF_API_VERSION || "v62.0",
  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET,
  AGENTFORCE_BASE_URL: process.env.AGENTFORCE_BASE_URL,
  AGENTFORCE_MY_DOMAIN_URL: process.env.AGENTFORCE_MY_DOMAIN_URL,
  AGENTFORCE_CLIENT_ID: process.env.AGENTFORCE_CLIENT_ID,
  AGENTFORCE_CLIENT_SECRET: process.env.AGENTFORCE_CLIENT_SECRET,
  AGENTFORCE_AGENT_ID: process.env.AGENTFORCE_AGENT_ID
};

module.exports = env;
