# Kademlia Test Code

## Description

- 오픈 데이터 공유 생태계에 신규 데이터 허브가 Join 할 경우, 데이터맵을 공유할 다른 데이터 허브들을 탐색해야 할 요구사항에 존재함에 따라, 
Peer-To-Peer 탐색 프로토콜인 Kademlia 를 활용하여 노트 탐색 기능 구현 계획
- 본 코드는 seed node 를 관리하는 Bootstrap Server 를 포함한 kademlia 의 주요 기능을 구현하고 검증을 목표로 함

## 테스트 환경 및 Dependency Library
Node.js 는 일단 최신 버전을 깔았습니다.
```
Node.js Version - v13.11.0

Dependency Library
- "k-bucket": "^5.1.0"
- "discover": "^0.4.3"
```
## 실행 가이드
```
// Dependency Library 설치
(KAIST_SODAS)$ npm install

(KAIST_SODAS)$ cd test

// bootstrap server 실행
(KAIST_SODAS/test)$ node bootstrapServer.js

// 테스트하고 싶은 만큼 새 터미널 띄운 뒤, test node 실행
// Argument: [node_name:string] / [port_number:number]
(KAIST_SODAS/test)$ node testNode.js [node_name] [port_number]
```
