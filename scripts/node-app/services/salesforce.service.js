const axios = require("axios");
const {
  SF_BASE_URL,
  SF_API_VERSION,
  CLIENT_ID,
  CLIENT_SECRET
} = require("../config/env");

async function getSalesforceAccessToken() {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);

  const response = await axios.post(
    `${SF_BASE_URL}/services/oauth2/token`,
    params,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return response.data.access_token;
}

async function updateCaseStatus(caseId, status) {
  const sfAccessToken = await getSalesforceAccessToken();
  await axios.patch(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/sobjects/Case/${caseId}`,
    { Status: status },
    {
      headers: {
        Authorization: `Bearer ${sfAccessToken}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function sendCaseEmail(caseId, toEmail, subject, body) {
  const sfAccessToken = await getSalesforceAccessToken();
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
        Authorization: `Bearer ${sfAccessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("sendCaseEmail response:", response.status, response.data);
}

async function getCaseInfo(caseId) {
  const sfAccessToken = await getSalesforceAccessToken();
  const response = await axios.get(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/query`,
    {
      headers: {
        Authorization: `Bearer ${sfAccessToken}`,
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

async function getAccountInfo(accountId) {
  const sfAccessToken = await getSalesforceAccessToken();
  const response = await axios.get(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/query`,
    {
      headers: {
        Authorization: `Bearer ${sfAccessToken}`,
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
  const sfAccessToken = await getSalesforceAccessToken();
  const response = await axios.get(
    `${SF_BASE_URL}/services/data/${SF_API_VERSION}/query`,
    {
      headers: {
        Authorization: `Bearer ${sfAccessToken}`,
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

function getAccountRecordUrl(accountId) {
  return `${SF_BASE_URL}/lightning/r/Account/${accountId}/view`;
}

module.exports = {
  getSalesforceAccessToken,
  updateCaseStatus,
  sendCaseEmail,
  getCaseInfo,
  getAccountInfo,
  getOpenCaseCount,
  getAccountRecordUrl
};
