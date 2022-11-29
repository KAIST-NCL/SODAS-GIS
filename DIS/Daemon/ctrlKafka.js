const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;
const deasync = require('deasync');
const debug = require('debug')('sodas:kafka\t\t|');


// KAFKA 관련 변경 사항: content는 무조건 string 포맷으로

class ctrlConsumer extends Consumer{

    /**
     * ctrlConsumer
     * 타겟이 되는 kafka 정보를 받아들여 주어진 조건을 만족하는 kafka로부터
     * 'send.datahub' 토픽의 정보를 지속적으로 listening하는 ctrlConsumer 객체 생성
     * @param {string} kafkaHost - kafka Host 정보
     * @param {dictionary} options - options for kafka
     * @param {DHDaemon} dhDaemon - dhDaemon object
     * @param {dictionary} conf - configuration
     */
    constructor(kafkaHost, options, dhDaemon, conf){
        const topics = [ {topic:'send.dataHub', partitions:0 } ];
        super(kafkaHost, topics, options);
        this.daemon = dhDaemon;
        this.conf = conf;
        this.governanceSystemIP = conf.get('GovernanceSystem', 'ip');
        this.governanceSystemPort = conf.get('GovernanceSystem', 'port');
    }
    /**
     * ctrlConsumer 의 onMessage 함수
     * @throws {error} 메시지가 send.dataHub의 규약을 따르지 않는 경우 에러 반환
     * @returns {eventSwitch(event, msg)} eventSwitch
     */
    onMessage = function(){
        debug('[RUNNING] Kafka consumer for control signal is running ');
        const that = this;
        this.consumer.on('message', function(message){
            // JSON parsing error
            try {
                const message_ = JSON.parse(message.value);
                const event = message_.operation;
                const msg = JSON.parse(message_.content);
                that.eventSwitch(event, msg);
            } catch (e){
                debug(e);
                return;
            }
        });
    };
    /**
     * send.datahub로 들어오는 메시지의 event 형태에 따른 대응
     * {START} - reference model 동기화 시작
     * {STOP} - DIS 동작 종료
     * {UPDATE} - 관심 허브 정보 등록
     * {SYNC_ON} - 특정 데이터 허브와 동기화 시작
     */
    eventSwitch = function(event, msg){
        switch(event){
            case 'START':
                this.daemon._rmSyncInit();
                debug('[Function Test / Init Process] START event');
                break;
            case 'STOP':
                debug('아직 미구현 - STOP event');
                break;
            case 'UPDATE':
                // content 내용이 수정되어서 name, extras, interests 세 개로 이뤄짐
                // name: 'dh' -> 무슨 용도?
                // extras: [{'key': 'k1', 'value': 'v2'}, ... ]
                // interests: ['d1', 'd1/t1', 'd2/t2/c2/c21']
                debug(msg);
                debug(msg.extras);
                debug(msg.interests);
                this.daemon._dhSearchUpdateInterestTopic({content: JSON.stringify(msg), interestTopic: msg.interests});
                this.daemon._smUpdateInterestTopic(msg.interests);
                debug('[Function Test / UPDATE Process] UPDATE event complete');
                break;
            case 'SYNC_ON':
                // contents - > datahubs로 바뀜
                var syncResult = this.daemon._smSyncOn(msg.datahubs);
                if (syncResult  === -1)
                    this.daemon._raiseError('UPDATE IS NOT YET COMPLETED');
                break;
            case 'SYNC_OFF':
                debug('아직 미구현 - SYNC OFF event');
                break;
            default:
                break;
        }
    };
}

exports.ctrlProducer = function(kafkaHost){
    this.client = new kafka.KafkaClient({kafkaHost: kafkaHost});
    this.producer = new Producer(this.client);
};

exports.ctrlProducer.prototype.createCtrlTopics = async function(){
    // create topics for DHDaemon
    var IS_COMPLETED = false;
    await this.client.createTopics([
        { topic: 'recv.dataHubList', partitions: 1 , replicationFactor: 1},
        // send.datahub - > send.dataHub로 변경해야함
        { topic: 'send.dataHub', partitions: 1, replicationFactor: 1},
        { topic: 'recv.asset', partitions: 1 , replicationFactor: 1},
        { topic: 'send.asset', partitions: 1, replicationFactor: 1},
        { topic: 'recv.referenceModel', partitions: 1, replicationFactor: 1},
        { topic: 'recv.dictionary', partitions: 1, replicationFactor: 1},
        { topic: 'recv.sessionList', partitions:1, replicationFactor: 1},
    ],
        function (err, data) {
            debug('[SETTING] Complete to create ctrl topics');
            IS_COMPLETED = true;
        }
    );
    while ((IS_COMPLETED == false)){deasync.runLoopOnce();}
    debug('[Function Test / Init Process] creating control topics is completed');
};

exports.ctrlProducer.prototype._produce = function(topic, msg){
    msg_ = JSON.stringify(msg);
    const payloads = [{ topic, messages: msg_ , partition: 0}];
    this.producer.send(payloads, function(err, data){
        if(err) debug(err);
    });
};

exports.ctrlProducer.prototype.sendError = function(errorCode){
    this._produce(this.topic, {'operation':'ERROR', 'error_code': errorCode});
};

exports.ctrlConsumer = ctrlConsumer;
