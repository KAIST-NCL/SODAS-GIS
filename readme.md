# SODAS+ Distributed Synchronization System

## 환경 요구사항
- node.js (> version 15.1) : `worker_threads` 의존성으로 인한 노드 버전 제한.

## DHDaemon

### 설치 방법 (TBD)

### 테스트 방법 (배포버전 업데이트 후 삭제 예정)
#### 1) `DH/setting.cfg` 수정
```editorconfig
[ENV]
DH_HOME={CurrentDIR (DH Folder)}
[Daemon]
name=KAIST
ip=127.0.0.1
portNum=50054
[DHSearch]
portNum=99098
[ReferenceHub]
bootstrap_ip=127.0.0.1
bootstrap_portNum=50051
referenceHub_ip=127.0.0.1
referenceHub_portNum=50052
[Kafka]
ip=0.0.0.0:9092
options={groupId: "sodas.ddh", commitOffsetsOnFirstJoin: false, autoCommit: false, fetchMaxWaitMs: 1000, fetchMaxBytes: 1024 * 1024 };
```

#### 2) 실행
```shell script
$ cd DH/
$ npm install
$ cd Daemon
$ node DHDaemon.js
```

## DHClient
데이터 허브 클라이언트 CLI 프로그램 (`sodasctl`)

### 설치 방법
```shell script
$ sudo npm install -g .
$ sodasctl
```

### 사용 예시

```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl 
Usage: -l <options> -i <list of interests>

Options:
      --help          Show help                                        [boolean]
      --version       Show version number                              [boolean]
  -l, --list          list of entities <datahub> or <session>           [string]
  -i, --set-interest  set list of interests <interests>                  [array]
```

#### 데이터 허브 리스트 조회
```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl -l dh
┌─────────┬─────────┬─────────────┬─────────┬───────────────────────────────┐
│ (index) │  name   │     ip      │ portNum │       syncInterestList        │
├─────────┼─────────┼─────────────┼─────────┼───────────────────────────────┤
│    0    │ 'KAIST' │ '127.0.0.1' │ '50049' │   [ 'DO1.CA1', 'DO1.CA2' ]    │
│    1    │ 'ETRI'  │ '127.0.0.1' │ '50048' │ [ 'DO1.CA1.CA11', 'DO1.CA3' ] │
└─────────┴─────────┴─────────────┴─────────┴───────────────────────────────┘
```

#### 연결된 세션 리스트 조회
```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl -l session
┌─────────┬─────────┬─────────────┬─────────┬──────────────────┬─────────────┬─────────────┬───────────┬───────────────────┬──────────────────┐
│ (index) │  name   │     ip      │ portNum │ syncInterestList │ minSyncTime │ maxSyncTime │ syncCount │ transferInterface │ dataCatalogVocab │
├─────────┼─────────┼─────────────┼─────────┼──────────────────┼─────────────┼─────────────┼───────────┼───────────────────┼──────────────────┤
│    0    │ 'KAIST' │ '127.0.0.1' │ '50049' │  [ 'DO1.CA1' ]   │     30      │     500     │    10     │      'gRPC'       │    'DCAT:V2'     │
└─────────┴─────────┴─────────────┴─────────┴──────────────────┴─────────────┴─────────────┴───────────┴───────────────────┴──────────────────┘
```

#### syncInterest 업데이트
```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl -i DO1.CA1 DO2
[SUCCESS] Complete to set new interests
┌─────────┬─────────┬─────────────┬─────────┬──────────────────────┐
│ (index) │  name   │     ip      │ portNum │   syncInterestList   │
├─────────┼─────────┼─────────────┼─────────┼──────────────────────┤
│    0    │ 'KAIST' │ '127.0.0.1' │ '50054' │ [ 'DO1.CA1', 'DO2' ] │
└─────────┴─────────┴─────────────┴─────────┴──────────────────────┘
```

## RH

