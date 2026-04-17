const axios = require("axios");
const {
  SF_BASE_URL,
  SF_API_VERSION,
  CLIENT_ID,
  CLIENT_SECRET
} = require("../config/env");

// Salesforce Access Token 발급
// 문제시 Connected App 확인
// Salesforce와의 interaction 시 매번 Token 재발급
// 캐싱 기능 추가 필요
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

// Case Status 변경
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

// Case 처리 시작 Email 전송
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

// CaseId 기반 정보 조회
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

// Account Id 기반 Account 정보 조회
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

// Account Id 기반 연관 Case 갯수 조회
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

// Account Id 기반 디테일 페이지 URL 생성
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
