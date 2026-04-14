public with sharing class SlackCaseNotifier {
    private static final String ENDPOINT = 'callout:SlackWebhookNC';

    public class Request {
        @InvocableVariable(required=true)
        public Id caseId;
    }

    @InvocableMethod(
        label='Send Case Alert to Slack'
        description='Send a case alert to Slack'
    )
    public static void sendCaseAlert(List<Request> requests) {
        if (requests == null || requests.isEmpty() || requests[0].caseId == null) {
            return;
        }

        Id caseId = requests[0].caseId;

        Case c = [
            SELECT Id, CaseNumber, Subject, Status, Priority, AccountId, Account.Name
            FROM Case
            WHERE Id = :caseId
            LIMIT 1
        ];

        Map<String, Object> payload = buildPayload(c);

        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json; charset=utf-8');
        req.setBody(JSON.serialize(payload));

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
            System.debug('Slack 알림 전송 실패: ' + res.getStatusCode() + ' / ' + res.getBody());
        }
    }

    private static Map<String, Object> buildPayload(Case c) {
        String fallbackText =
            '신규 Case 접수 - Case Number: ' + safe(c.CaseNumber) +
            '\nSubject: ' + safe(c.Subject) +
            '\nStatus: ' + safe(c.Status) +
            '\nPriority: ' + safe(c.Priority) +
            '\nAccount: ' + safe(c.AccountId != null ? c.Account.Name : null);

        List<Object> blocks = new List<Object>();

        blocks.add(new Map<String, Object>{
            'type' => 'header',
            'text' => new Map<String, Object>{
                'type' => 'plain_text',
                'text' => '🚨 신규 Case 접수'
            }
        });

        List<Object> fields = new List<Object>{
            new Map<String, Object>{
                'type' => 'mrkdwn',
                'text' => '*Case Number :* ' + safe(c.CaseNumber)
            },
            new Map<String, Object>{
                'type' => 'mrkdwn',
                'text' => '*Status :* ' + safe(c.Status)
            },
            new Map<String, Object>{
                'type' => 'mrkdwn',
                'text' => '*Subject :* ' + safe(c.Subject)
            },
            new Map<String, Object>{
                'type' => 'mrkdwn',
                'text' => '*Priority :* ' + safe(c.Priority)
            }
        };

        if (c.AccountId != null) {
            fields.add(new Map<String, Object>{
                'type' => 'mrkdwn',
                'text' => '*Account Name :* ' + safe(c.Account.Name)
            });
        }

        blocks.add(new Map<String, Object>{
            'type' => 'section',
            'fields' => fields
        });

        blocks.add(new Map<String, Object>{
            'type' => 'divider'
        });

        List<Object> actions = new List<Object>();

        if (c.AccountId != null) {
            actions.add(new Map<String, Object>{
                'type' => 'button',
                'action_id' => 'view_account',
                'text' => new Map<String, Object>{
                    'type' => 'plain_text',
                    'text' => '고객 정보 보기',
                    'emoji' => true
                },
                'style' => 'primary',
                'value' => 'view_account|' + c.Id + '|' + c.AccountId
            });
        }

        actions.add(new Map<String, Object>{
            'type' => 'button',
            'action_id' => 'start_case',
            'text' => new Map<String, Object>{
                'type' => 'plain_text',
                'text' => 'Case 처리 시작',
                'emoji' => true
            },
            'value' => 'start_case|' + c.Id
        });

        blocks.add(new Map<String, Object>{
            'type' => 'actions',
            'elements' => actions
        });

        return new Map<String, Object>{
            'blocks' => blocks,
            'text' => fallbackText
        };
    }

    private static String safe(String value) {
        return String.isBlank(value) ? '-' : value;
    }
}