# SODAS+ Distributed Synchronization System

## 환경 요구사항
- node.js (> version 15.1) : `worker_threads` 의존성으로 인한 노드 버전 제한.
- git (> version 1.17) : version control 라이브러리로 인한 버전 제한.

## DHDaemon

### 설치 방법

### 테스트 방법 1. Standalone - Docker 기반
> Tip for your debugging! Please run container environment bellow. You can copy your code to container for testing your updated code. (To give some freedom to your container, you can rebuild your container image without entry point, and run with /bin/bash ) Please test on your container using docker cp command. After finishing to test your all revision code, please commit your code to master code.


> 디버깅을 위한 팁 ! 아래 명령어를 따라 standalone machine에서 테스트 수행. 수행 시, 자유로운 디버깅을 위해서는 컨테이너 이미지 entrypoint를 없애고 /bin/bash 로 진입하도록 실행한 후, 수정한 디버깅 코드를 docker cp 명령어를 통해 컨테이너로 옮겨서 동작 테스트를 해볼 수 있음. 컨테이너 상에서 동작을 모두 확인한 후 master 브랜치로 push해주세요.

#### 1. Create SODAS network

```bash
docker network create sodas
```

#### 2. Build `DHDaemon`, `BootstrapServer`, `RH`



- Build the Dockerfile

```bash
docker build -t sodas/dhdaemon:v01 --build-arg REPO_TOKEN={YOUR ACCESS TOKEN HERE} ./KAIST_SODAS/DH
```

```bash
docker build -t sodas/rhdaemon:v01 --build-arg REPO_TOKEN={YOUR TOKEN} RH/RMSync/
```

```bash
$ docker build -t sodas/bootstrap:v01 --build-arg REPO_TOKEN={YOUR TOKEN} RH/BootstrapServer/
```

#### 3. Run `zookeepr` , `kafka` as your own environment &  `RH` at your stand-alone server environment with docker-compose

Install `docker-compose` first,

```bash
sudo apt-get install docker-compose
```

Run all pre-requisite containers with `docker-compose`

```bash
docker-compose up -d
```

You can run `zookeepr` and `kafka` with the following yaml file.

- (I set the port number of kafka as 9093 (by default 9092 is commonly used, but I change the port number to prevent conflict between baremetal kafka (if exist))
- `docker-compose.yaml` is written as follows. It runs both zookeeper and kafka with network and port setting.
    
    ```bash
    ---
    version: '2.2'
    
    networks:
      default:
        external:
          name: sodas
    
    services:
      sodas.zookeeper:
        image: confluentinc/cp-zookeeper
        container_name: sodas.zookeeper
        environment:
          ZOOKEEPER_CLIENT_PORT: 2181
    
      sodas.broker:
        image: confluentinc/cp-kafka
        container_name: sodas.broker
        depends_on:
          - sodas.zookeeper
        ports:
          - "9093:9092"
        environment:
          KAFKA_BROKER_ID: 1
          KAFKA_ZOOKEEPER_CONNECT: sodas.zookeeper:2181
          KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://sodas.broker:9093
          KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
          KAFKA_EXTERNAL_PORT: 9093
    
      sodas.referencehub:
        image: sodas/rhdaemon:v01
        container_name: sodas.referencehub
    ```
    

#### 4. Run your `DataHub` with the following command line.

```bash
$ docker run --rm --network=sodas --name=sodas.datahub -it sodas/dhdaemon:v01
```

#### 5. Test Kafka Message with your container Kafka

```bash
$ docker run -it --rm --network sodas confluentinc/cp-kafka /bin/kafka-console-producer --bootstrap-server sodas.broker:9093 --topic send.datahub
> { "operation": "START", "content": {} }
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

