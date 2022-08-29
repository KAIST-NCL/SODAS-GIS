### Install & Execute  Environment
**For Ubuntu Based Systems(Ubuntu 18.04 기준 설치 설명)**
* Kafka 설치
    * [Kafka Apache 사이트](https://kafka.apache.org/downloads)에서 Binary version 설치
        * `wget https://dlcdn.apache.org/kafka/2.8.0/kafka_2.12-2.8.0.tgz`
        * `tar xzvf kafka_2.12-2.8.0.tgz --strip 1`

* Zookeeper, kafka-server 실행
    * Zookeeper 실행 : `bin/zookeeper-server-start.sh config/zookeeper.properties`
        *(if neccessary) 관련 properties는 config/zookeeper.properties 에서 수정 
    * Kafka 서버 실행: `bin/kafka-server-start.sh config/server.properties`
        *(if neccessary) 관련 properties는 config/server.properties 에서 수정 

### Related Packages
* `npm install kafka-node` 했고, package.json , package-lock.json 에 반영됨

### Issue!
* test로 producer.js 로 메시지 보내고 consumer.js 로 받은 다음에, test 용 메시지를 지우는 기능 찾는 중ㅠ