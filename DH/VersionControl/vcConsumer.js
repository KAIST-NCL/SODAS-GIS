const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const debug = require('debug')('sodas:vcConsumer');

// NodeJS에서 extends는 상속하는데 사용한다
class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'recv.asset', partitions:0} ];
        super(kafkaHost, topics, options); // 부모 생성자 호출
        this.VC = VC; // vcModule
    }
    run(){
        debug('[RUNNING] kafka consumer for VC is running');
        const that = this;
        this.consumer.on('message', function(message) {
            that.handler(message, that);
        });
    }
    handler(message, self){
        debug('[LOG] Kafka Message Received');
        const message_ = JSON.parse(message.value);
        const event = message_.operation;
        const filepath = self.VC.vc.rp.related_to_filepath(message_.related) + '/' + message_.id + '.asset';
        // Changed Logs - > Previous: editFile and then commit right away
        // Changed Logs - > Now: editFile only. Commit is done with some period
        self.VC.editFile(event, filepath, message_.contents);
        self.VC.count = self.VC.count + 1;
    }
}

exports.vcConsumer = vcConsumer;
