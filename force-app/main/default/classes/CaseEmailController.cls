@RestResource(urlMapping='/case-email/*')
global with sharing class CaseEmailController {
    global class EmailRequest {
        public Id caseId;
        public String toEmail;
        public String subject;
        public String body;
    }

    @HttpPost
    global static void sendCaseEmail() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        try {
            String raw = req.requestBody == null ? null : req.requestBody.toString();
            EmailRequest input = (EmailRequest) JSON.deserialize(raw, EmailRequest.class);

            if (String.isBlank(raw)) {
                res.statusCode = 400;
                res.responseBody = Blob.valueOf('Missing request body');
                return;
            }

            if (input == null || input.caseId == null || String.isBlank(input.toEmail) || String.isBlank(input.subject) || String.isBlank(input.body)) {
                res.statusCode = 400;
                res.responseBody = Blob.valueOf('Missing required fields');
                return;
            }

            Case c = [
                SELECT Id, CaseNumber, Status
                FROM Case
                WHERE Id = :input.caseId
                LIMIT 1
            ];

            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setToAddresses(new String[] { input.toEmail });
            mail.setSubject(input.subject);
            mail.setPlainTextBody(input.body);

            OrgWideEmailAddress owea = [
                SELECT Id
                FROM OrgWideEmailAddress
                WHERE Address = 'eses816@gmail.com'
                LIMIT 1
            ];
            System.debug('OWEA: ' + owea + ' / OWEA ID: ' + owea.Id);
            mail.setOrgWideEmailAddressId(owea.Id);

            Messaging.SendEmailResult[] results =
                Messaging.sendEmail(new Messaging.SingleEmailMessage[] { mail });

            if (results == null || results.isEmpty() || !results[0].isSuccess()) {
                String errorMessage = 'Unknown email send error';
                if (results != null && !results.isEmpty() && results[0].getErrors() != null && !results[0].getErrors().isEmpty()) {
                    errorMessage = results[0].getErrors()[0].getMessage();
                }
                res.statusCode = 500;
                res.responseBody = Blob.valueOf(errorMessage);
                return;
            }

            res.statusCode = 200;
            res.responseBody = Blob.valueOf('ok');
        } catch (Exception e) {
            res.statusCode = 500;
            res.responseBody = Blob.valueOf(e.getMessage());
        }
    }
}