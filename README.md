<p align="middle">
  <img width="350px" src="docs/slack-logo.png"/>
</p>
<h3 align="middle">Slack-Salesforce Case Workflow: Work OS 기반 고객지원 협업 시스템</h3>

<br/>

## 📝 작품소개

Salesforce에 생성된 고객지원 Case를 Slack으로 확장하여  
조회·판단·처리까지 연결되는 **협업형 Work OS를 구현한 프로젝트**입니다.

단순 알림 전송이 아닌  
**이벤트 발생 → Slack 알림 → 사용자 액션 → Salesforce 처리 → 결과 피드백**까지 이어지는  
양방향 워크플로우 구조를 설계하고 구현하였습니다.

Slack을 단순 커뮤니케이션 도구가 아닌  
**CRM 업무를 실행하는 인터페이스로 활용**하는 것을 목표로 구성하였습니다.

<br/>

## 🌁 프로젝트 배경

### 협업툴 중심 업무 전환의 필요성

기존 CRM 업무는 Salesforce에 직접 접속하여  
데이터 조회 및 처리를 수행하는 방식이 일반적입니다.

하지만 실무 환경에서는 Slack과 같은 협업툴에서  
업무 알림을 받고 의사결정을 진행하는 경우가 많으며,

이 과정에서  
- CRM과 협업툴 간의 단절  
- 반복적인 시스템 이동  
- 처리 지연  

과 같은 비효율이 발생합니다.

---

### 🎯 프로젝트 목표 (TO-BE)

**1. 실시간 협업 기반 고객지원 처리**
- Case 발생 즉시 Slack으로 알림을 전달하고  
  Slack에서 바로 후속 처리 수행 가능하도록 구성

**2. CRM 데이터의 Work OS 확장**
- Salesforce 데이터를 Slack으로 확장하여  
  조회·처리까지 이어지는 업무 흐름 구축

**3. 양방향 인터랙션 구조 구현**
- 단순 알림이 아닌 사용자 액션 기반으로  
  Salesforce 데이터가 변경되는 구조 설계

**4. Agent 기반 고객지원 자동화**
- 미해결 Case 간 유사도 분석을 통해 중복 이슈를 식별하고 병합 처리 지원  
- 고객 문의 내용을 기반으로 해결 방향 및 응대 문구를 자동 생성  
- 조회·판단·처리 흐름에 Agent를 결합하여 의사결정 지원 기능 확장

<br/>

## ⭐ 주요 기능

### 1. 신규 Case Slack 알림

- Salesforce Case 생성 시 Slack 채널로 실시간 알림 전송
- 주요 정보 및 액션 버튼을 포함한 카드형 메시지 제공

---

### 2. 고객 정보 조회

- Slack에서 Account 정보 및 미해결 Case 수 조회
- 운영자가 빠르게 상황을 파악할 수 있도록 요약 형태로 제공

---

### 3. Case 처리 시작 (Email 전송)

- Slack 모달을 통해 고객 응대 이메일 작성
- 이메일 발송과 동시에 Case 상태 변경

---

### 4. Slack 인터랙션 기반 처리

- 버튼 클릭 및 모달 입력을 통해  
  Salesforce 데이터 조회 및 처리 수행
- Slack → Node → Salesforce → Slack 흐름의 양방향 구조 구현

<br/>

## 🔨 프로젝트 구조

### 시스템 흐름

```
[Salesforce]
   ↓  (Flow Trigger)
[Apex]
   ↓ (Webhook)
[Slack]
   ↓ (Interaction)
[Node.js Server]
   ↓ (REST API)
[Salesforce]
```

<br/>

## 🔧 Stack

### Platform
- Salesforce (Sales Cloud)
- Slack

### Backend
- Apex
- Node.js (Express)

### Integration
- Slack API
- Salesforce REST API

<br/>

## 💡 경험 및 성과

- **협업툴 기반 UX 설계 경험**
  - Slack에서 CRM 데이터를 조회하고 처리하는 워크플로우 설계

- **양방향 시스템 연동 경험**
  - Salesforce → Slack 알림, Slack → Salesforce 처리 흐름 구현

- **아키텍처 전환 경험**
  - Flow 중심 구조에서 한계를 인식하고  
    Apex + 외부 서버 기반 구조로 확장

- **운영 관점 고려**
  - 사용자 입력 UX, 처리 흐름, 이메일 전달 등 실제 운영 시나리오 반영

<br/>

## 🚀 확장 계획

- **Agent 기반 Case 분석 및 자동화**
  - 미해결 Case 간 유사도 분석을 통한 중복 이슈 식별 및 병합 지원
  - 고객 문의 기반 해결 방향 및 응대 문구 자동 생성

- **UX 고도화**
  - Slack 내 알림 및 피드백 구조 개선

<br/>

## 🙋‍♂️ Team

| 역할 | 이름 |
|------|------|
| **Salesforce Developer (Solo)** | **김은수** |

---

**본 프로젝트는 CRM 데이터를 협업툴로 확장하여,  
조회·판단·처리까지 이어지는 새로운 고객지원 워크플로우를 제시합니다.**