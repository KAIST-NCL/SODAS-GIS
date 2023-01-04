const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const debug = require('debug')('sodas:vcConsumer');

/**
 * send.referenceModel 과 send.dictionary 를 수신하여 처리하는 Kafka Consumer 객체
 * @constructor
 * @param {string} kafkaHost - kafka Host 정보
 * @param {dictionary} options - options for kafka
 * @param {vcModule} VC - vcModule 객체
 */
class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'send.referenceModel', partitions:0},
                         {topic:'send.dictionary', partitions:0} ];
        console.log(kafkaHost,topics,options);
        super(kafkaHost, topics, options);
        this.VC = VC;
    }
    /**
     * Kafka Consumer handler 등록을 통한 Kafka Consumer 를 구동하는 함수.
     * @method
     */
    run(){
        debug('[RUNNING] kafka consumer for VC of GS is running');
        const that = this;
        this.consumer.on('message', function(message) {
            // Kafka Message 양식
            // { topic: '', value:'', offset:#, partition:0, highWaterOffset:#, key:null }
            that.handler(message, that);
        });
    }
    /**
     * 지정된 메시지 수신 시, 메시지 파싱 후 파일 생성 및 업데이트
     * ``send.referenceModel`` 또는 ``send.dictionary`` 로 들어오는 모든 이벤트를 vcModule로 파싱하여 전달
     * @method
     * @param {dictionary(topic,value)} message - Kafka 메시지
     * @param {string} message:topic - Kafka 토픽 ``send.referenceModel`` 또는 ``send.dictionary``
     * @param {dictionary} message:value - Kafka 내용물
     * @param {vcConsumer} self - vcConsumer 객체
     * @see vcModule.editFile
     * @see vcModule.commit
     */
    handler(message, self){
        try {
            debug('[LOG] Kafka Message for GS is received - ' + message.topic);
            const message_ = JSON.parse(message.value);
            const event = message_.operation;

            // topic에 따라 약간은 차별할 필요가 있다
            var tp;
            if (message.topic == 'send.referenceModel') tp = 'referenceModel';
            else if (message.topic == 'send.dictionary') tp = 'dictionary';

            var filepath = self.VC.vc.vcRoot + '/' + tp + '/' + message_.type+ '/'+ message_.id + '.json';

            // 메시지를 통째로 저장한다
            // do the operation right away
            self.VC.editFile(event, filepath,message_.type, JSON.stringify(message_)).then(() => {
                const commitMessage = message_.id;
                self.VC.commit(self.VC, filepath, commitMessage, message_);
            });
        }
        catch (e) {
            debug(e);
            return;
        }
    }
}

exports.vcConsumer = vcConsumer;
