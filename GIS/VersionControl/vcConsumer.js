const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const debug = require('debug')('sodas:vcConsumer');

class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'send.referenceModel', partitions:0},
                         {topic:'send.dictionary', partitions:0} ];
        console.log(kafkaHost,topics,options);
        super(kafkaHost, topics, options); 
        this.VC = VC; 
    }
    run(){
        debug('[RUNNING] kafka consumer for VC of GS is running');
        const that = this;
        this.consumer.on('message', function(message) {
            // Kafka Message 양식
            // { topic: '', value:'', offset:#, partition:0, highWaterOffset:#, key:null }
            that.handler(message, that);
        });
    }
    // Kafka message received event handler
    handler(message, self){
        try {
            debug('[LOG] Kafka Message for GS is received - ' + message.topic);
            const message_ = JSON.parse(message.value);
            const event = message_.operation;

            // topic에 따라 약간은 차별할 필요가 있다
            var tp;
            if (message.topic == 'send.referenceModel') tp = 'referenceModel';
            else if (message.topic == 'send.dictionary') tp = 'dictionary';

            var filepath = self.VC.vc.vcRoot + '/' + tp + '/' + message_.type+ '/'+ message_.id;
            
            // 메시지를 통째로 저장한다
            // do the operation right away
            self.VC.editFile(event, filepath,message_.type, message_).then(() => {
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

// 수정해야하는 사항
// 기존과 다르게 파싱하지 말고 JSON 방식으로 메시지 저장
// 나중에 불러올 때 JSON content내용 파싱하게끔 수정
// 다만, 저장하는 이름은 원래 저장하던 이름과 동일하게