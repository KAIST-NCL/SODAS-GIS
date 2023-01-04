const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;
const deasync = require('deasync');
const debug = require('debug')('sodas:GSkafka');

/**
 * 타겟이 되는 kafka 정보를 받아들여 주어진 조건을 만족하는 kafka 로부터
 * ``send.governanceSystem`` 토픽의 정보를 지속적으로 listening 하는 ctrlConsumer 객체 생성
 * @constructor
 * @param {string} kafkaHost - kafka Host 정보
 * @param {dictionary} options - options for kafka
 * @param {DHDaemon} gsDaemon - gsDaemon object
 * @param {dictionary} conf - configuration
 */
class ctrlConsumer extends Consumer{
    constructor(kafkaHost, options, gsDaemon, conf){
        const topics = [
            { topic: 'send.governanceSystem', partitions: 1 , replicationFactor: 1}
        ];
        super(kafkaHost, topics, options);
        this.daemon = gsDaemon;
        this.conf = conf;
        this.governanceSystemIP = conf.get('GovernanceSystem', 'ip');
        this.governanceSystemPort = conf.get('GovernanceSystem', 'port');
    }

    /**
     * ctrlConsumer 의 onMessage 함수
     * ``send.governanceSystem`` 토픽으로 들어오는 메시지를 이벤트와 메시지로 파싱한 후,
     * 이벤트 종류에 따른 처리를 위해 ``ctrlConsumer.governanceSystemHandler`` 로 전달
     * @method
     * @throws {error} kafka 메시지가 send.governanceSystem 의 규약을 따르지 않는 경우 에러 반환
     * @see ctrlConsumer.governanceSystemHandler
     */
    onMessage = function(){
        try {
            debug('[RUNNING] Kafka consumer for control signal is running ');
            const self = this;
            this.consumer.on('message', function(message){

                // JSON parsing error
                try {
                    const topic_ = message.topic; // Grammer check needed
                    const message_ = JSON.parse(message.value);
                    switch(topic_) {
                        case 'send.governanceSystem':
                            self.governanceSystemHandler(message_);
                            break;
                        default:
                            debug("Wrong type of Kafka topic came in");
                            break;
                    }
                } catch (e){
                    debug(e);
                    return;
                }
            });
        }
        catch (e) {
            debug(e);
            return;
        }
    };

    /**
     * send.governanceSystem 로 들어오는 메시지의 event 형태에 따른 대응
     *
     * ``START`` : GIS 동작 시작 및 reference model/dictionary 동기화 시작 (``GSDaemon._rmSMInit``)
     *
     * ``UPDATE`` : GIS 세팅 정보 업데이트 (not yet implemented)
     *
     * ``STOP`` : GIS 동작 종료 (not yet implemented)
     * @method
     * @see GSDaemon._rmSMInit
     * @param {dictionary(operation,content)} msg - kafka 메시지
     * @param {string} msg:operation - ``START``, ``UPDATE``, ``STOP``
     */
    governanceSystemHandler = function(msg){
        // event Type: START / UPDATE / STOP
        const content = JSON.parse(msg.content);
        switch(msg.operation) {
            case 'START':
                debug("governanceSystem - START");
                this.daemon._rmSMInit();
                break;
            case 'UPDATE':
                debug("governanceSystem - UPDATE");
                break;
            case 'STOP':
                debug("governanceSystem - STOP");
                break;
            default:
                debug("Wrong type of operation");
                break;
        }
    };

    /**
     * kafka 토픽을 생성하는 함수로 GIS 에서 사용하는 모든 토픽을 생성함.
     * 해당 토픽이 이미 생성되어 있는 경우 생성하지 않으며, 토픽이 없는 경우 시스템이 동작할 수 없으므로 모든 토픽이 생성된 후 반환됨.
     * @method
     * @returns {Promise<void>} createTopics()
     */
    createControlTopics = async function(){
        // create topics for DHDaemon
        var IS_COMPLETED = false;
        await this.consumer.client.createTopics([
            { topic: 'send.governanceSystem', partitions: 1 , replicationFactor: 1},
            { topic: 'send.referenceModel', partitions: 1 , replicationFactor: 1},
            { topic: 'send.dictionary', partitions: 1 , replicationFactor: 1}
        ],
            function (err, data) {
                debug('[SETTING] Complete to create ctrl topics');
                IS_COMPLETED = true;
            }
        );
        while ((IS_COMPLETED == false)){deasync.runLoopOnce();}
        debug('[Function Test / Init Process] creating control topics is completed');
    }
};

exports.ctrlConsumer = ctrlConsumer;
