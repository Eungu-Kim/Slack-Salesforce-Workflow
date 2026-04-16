@RestResource(urlMapping='/case-duplicate/candidates')
global with sharing class CaseDuplicateController {

    // Request DTO
    global class RequestWrapper {
        public Id caseId;
    }

    // Response DTO
    global class ResponseWrapper {
        public CaseInfo currentCase;
        public List<CaseInfo> candidates;
    }

    // Case 정보 구조
    global class CaseInfo {
        public Id id;
        public String caseNumber;
        public String subject;
        public String description;
        public String status;
        public Datetime createdDate;
        public Id accountId;
        public String accountName;
    }

    @HttpPost
    global static ResponseWrapper getCandidates() {
        RestRequest req = RestContext.request;

        RequestWrapper body = (RequestWrapper) JSON.deserialize(
            req.requestBody.toString(),
            RequestWrapper.class
        );

        if (body == null || body.caseId == null) {
            throw new AuraHandledException('caseId is required');
        }

        // 현재 Case 조회
        Case current = [
            SELECT Id, CaseNumber, Subject, Description, Status, CreatedDate,
                   AccountId, Account.Name
            FROM Case
            WHERE Id = :body.caseId
            LIMIT 1
        ];

        // Account 없으면 후보 없음
        if (current.AccountId == null) {
            ResponseWrapper emptyRes = new ResponseWrapper();
            emptyRes.currentCase = mapCase(current);
            emptyRes.candidates = new List<CaseInfo>();
            return emptyRes;
        }

        // 후보 Case 조회
        List<Case> candidateCases = [
            SELECT Id, CaseNumber, Subject, Description, Status, CreatedDate, AccountId, Account.Name
            FROM Case
            WHERE AccountId = :current.AccountId
            AND Id != :current.Id
            AND Status IN ('New', 'Working')
            ORDER BY CreatedDate ASC
        ];

        // 응답 구성
        ResponseWrapper res = new ResponseWrapper();
        res.currentCase = mapCase(current);
        res.candidates = new List<CaseInfo>();

        for (Case c : candidateCases) {
            res.candidates.add(mapCase(c));
        }

        return res;
    }

    // Case → DTO 변환
    private static CaseInfo mapCase(Case c) {
        CaseInfo info = new CaseInfo();
        info.id = c.Id;
        info.caseNumber = c.CaseNumber;
        info.subject = c.Subject;
        info.description = c.Description;
        info.status = c.Status;
        info.createdDate = c.CreatedDate;
        info.accountId = c.AccountId;
        info.accountName = (c.Account != null) ? c.Account.Name : null;
        return info;
    }
}