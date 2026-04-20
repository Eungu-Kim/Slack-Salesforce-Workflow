public with sharing class AgentCaseHistoryContextAction {
    public class Input {
        @InvocableVariable(required=true)
        public Id caseId;
    }

    public class Output {
        @InvocableVariable public Id caseId;
        @InvocableVariable public String caseNumber;
        @InvocableVariable public String subject;
        @InvocableVariable public String description;
        @InvocableVariable public String status;
        @InvocableVariable public String contactEmail;
        @InvocableVariable public Id accountId;
        @InvocableVariable public String accountName;
        @InvocableVariable public Integer openCaseCount;
        @InvocableVariable public String relatedCasesSummary;
        @InvocableVariable public String recentCasesJson;
    }

    @InvocableMethod(
        label='Get Case History Context for Next Action'
        description='Returns current case context and related account case history for next-action recommendation.'
    )
    public static List<Output> getCaseHistoryContext(List<Input> inputs) {
        List<Output> results = new List<Output>();
        if (inputs == null || inputs.isEmpty()) {
            return results;
        }

        Set<Id> caseIds = new Set<Id>();
        for (Input input : inputs) {
            if (input != null && input.caseId != null) {
                caseIds.add(input.caseId);
            }
        }
        if (caseIds.isEmpty()) {
            return results;
        }

        Map<Id, Case> currentCaseMap = new Map<Id, Case>([
            SELECT Id, CaseNumber, Subject, Description, Status, ContactEmail,
                   AccountId, Account.Name, CreatedDate
            FROM Case
            WHERE Id IN :caseIds
        ]);

        Set<Id> accountIds = new Set<Id>();
        for (Case c : currentCaseMap.values()) {
            if (c.AccountId != null) {
                accountIds.add(c.AccountId);
            }
        }

        Map<Id, Integer> openCaseCountByAccount = new Map<Id, Integer>();
        if (!accountIds.isEmpty()) {
            for (AggregateResult ar : [
                SELECT AccountId accId, COUNT(Id) cnt
                FROM Case
                WHERE AccountId IN :accountIds
                  AND Status IN ('New', 'Working', 'Escalated')
                GROUP BY AccountId
            ]) {
                openCaseCountByAccount.put(
                    (Id) ar.get('accId'),
                    (Integer) ar.get('cnt')
                );
            }
        }

        Map<Id, List<Case>> relatedCasesByAccount = new Map<Id, List<Case>>();
        if (!accountIds.isEmpty()) {
            for (Case c : [
                SELECT Id, CaseNumber, Subject, Description, Status, CreatedDate, AccountId
                FROM Case
                WHERE AccountId IN :accountIds
                ORDER BY CreatedDate DESC
            ]) {
                if (!relatedCasesByAccount.containsKey(c.AccountId)) {
                    relatedCasesByAccount.put(c.AccountId, new List<Case>());
                }
                relatedCasesByAccount.get(c.AccountId).add(c);
            }
        }

        for (Input input : inputs) {
            Output out = new Output();
            Case currentCase = currentCaseMap.get(input.caseId);

            if (currentCase == null) {
                results.add(out);
                continue;
            }

            out.caseId = currentCase.Id;
            out.caseNumber = currentCase.CaseNumber;
            out.subject = currentCase.Subject;
            out.description = currentCase.Description;
            out.status = currentCase.Status;
            out.contactEmail = currentCase.ContactEmail;
            out.accountId = currentCase.AccountId;
            out.accountName = currentCase.Account != null ? currentCase.Account.Name : null;
            out.openCaseCount = currentCase.AccountId != null && openCaseCountByAccount.containsKey(currentCase.AccountId)
                ? openCaseCountByAccount.get(currentCase.AccountId)
                : 0;

            List<Object> recentCaseDtos = new List<Object>();
            Integer relatedCount = 0;

            if (currentCase.AccountId != null && relatedCasesByAccount.containsKey(currentCase.AccountId)) {
                for (Case relatedCase : relatedCasesByAccount.get(currentCase.AccountId)) {
                    if (relatedCase.Id == currentCase.Id) {
                        continue;
                    }

                    relatedCount++;

                    if (recentCaseDtos.size() < 5) {
                        Map<String, Object> dto = new Map<String, Object>();
                        dto.put('caseNumber', relatedCase.CaseNumber);
                        dto.put('subject', relatedCase.Subject);
                        dto.put('status', relatedCase.Status);
                        dto.put('createdDate', String.valueOf(relatedCase.CreatedDate.date()));
                        dto.put('description', relatedCase.Description);
                        recentCaseDtos.add(dto);
                    }
                }
            }

            out.relatedCasesSummary =
                '같은 Account에서 현재 Case를 제외한 관련 이력 ' +
                String.valueOf(relatedCount) +
                '건이 있습니다. 최근 5건 이내 이력을 참고하여 반복 문의 또는 재문의 여부를 판단하세요.';

            out.recentCasesJson = JSON.serialize(recentCaseDtos);

            results.add(out);
        }

        return results;
    }
}