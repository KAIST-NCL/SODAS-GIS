const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const debug = require('debug')('sodas:vcConsumer\t|');

/**
 * send.referenceModel 과 send.dictionary 를 수신하여 처리하는 Kafka Consumer 객체
 * @constructor
 * @param {string} kafkaHost - kafka Host 정보
 * @param {dictionary} options - options for kafka
 * @param {vcModule} VC - vcModule 객체
 */
class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'send.asset', partitions:0} ];
        super(kafkaHost, topics, options); 
        this.VC = VC; 
    }

    /**
     * Kafka Consumer handler 등록을 통한 Kafka Consumer 를 구동하는 함수.
     * @method
     */
    run(){
        debug('[RUNNING] kafka consumer for VC is running');
        const that = this;
        this.consumer.on('message', function(message) {
            that.handler(message, that);
        });
    }

    /**
     * 지정된 메시지 수신 시, 메시지 파싱 후 파일 생성 및 업데이트
     * ``send.asset`` 으로 들어오는 모든 이벤트를 vcModule로 파싱하여 전달
     * @method
     * @param {dictionary(topic,value)} message - Kafka 메시지
     * @param {string} message:topic - Kafka 토픽 ``asset``
     * @param {dictionary} message:value - Kafka 내용물
     * @param {vcConsumer} self - vcConsumer 객체
     * @see vcModule.editFile
     * @see vcModule.commit
     */
    handler(message, self){
        try {
            debug('[LOG] Kafka Message Received');
            const message_ = JSON.parse(message.value);
            const event = message_.operation;
            const filepath = self.VC.vc.rp.related_to_filepath(message_.related) + '/' + message_.id + '.asset';
            
            
            /* Uncomment for Pooling 
            self.VC.editFile(event, filepath, message_.contents);
            self.VC.count = self.VC.count + 1;
            */

            // Comment below for Pooling
            self.VC.editFile(event, filepath, JSON.stringify(message_)).then(() => {
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
