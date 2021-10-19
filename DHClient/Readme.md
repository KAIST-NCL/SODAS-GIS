# Data Hub Client

데이터 허브 클라이언트 CLI 프로그램 (`sodasctl`)

## 설치 방법
```shell script
$ sudo npm install -g .
$ sodasctl
```

## 사용 예시

```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl 
Usage: -l <options> -i <list of interests>

Options:
      --help          Show help                                        [boolean]
      --version       Show version number                              [boolean]
  -l, --list          list of entities <datahub> or <session>           [string]
  -i, --set-interest  set list of interests <interests>                  [array]
```

### 데이터 허브 리스트 조회
```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl -l dh
┌─────────┬─────────┬─────────────┬─────────┬───────────────────────────────┐
│ (index) │  name   │     ip      │ portNum │       syncInterestList        │
├─────────┼─────────┼─────────────┼─────────┼───────────────────────────────┤
│    0    │ 'KAIST' │ '127.0.0.1' │ '50049' │   [ 'DO1.CA1', 'DO1.CA2' ]    │
│    1    │ 'ETRI'  │ '127.0.0.1' │ '50048' │ [ 'DO1.CA1.CA11', 'DO1.CA3' ] │
└─────────┴─────────┴─────────────┴─────────┴───────────────────────────────┘
```

### 연결된 세션 리스트 조회
```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl -l session
┌─────────┬─────────┬─────────────┬─────────┬──────────────────┬─────────────┬─────────────┬───────────┬───────────────────┬──────────────────┐
│ (index) │  name   │     ip      │ portNum │ syncInterestList │ minSyncTime │ maxSyncTime │ syncCount │ transferInterface │ dataCatalogVocab │
├─────────┼─────────┼─────────────┼─────────┼──────────────────┼─────────────┼─────────────┼───────────┼───────────────────┼──────────────────┤
│    0    │ 'KAIST' │ '127.0.0.1' │ '50049' │  [ 'DO1.CA1' ]   │     30      │     500     │    10     │      'gRPC'       │    'DCAT:V2'     │
└─────────┴─────────┴─────────────┴─────────┴──────────────────┴─────────────┴─────────────┴───────────┴───────────────────┴──────────────────┘
```

### syncInterest 업데이트
```shell script
yejyang@handel:~/DEV/KAIST_SODAS/DHClient$ sodasctl -i DO1.CA1 DO2
[SUCCESS] Complete to set new interests
┌─────────┬─────────┬─────────────┬─────────┬──────────────────────┐
│ (index) │  name   │     ip      │ portNum │   syncInterestList   │
├─────────┼─────────┼─────────────┼─────────┼──────────────────────┤
│    0    │ 'KAIST' │ '127.0.0.1' │ '50054' │ [ 'DO1.CA1', 'DO2' ] │
└─────────┴─────────┴─────────────┴─────────┴──────────────────────┘
```
