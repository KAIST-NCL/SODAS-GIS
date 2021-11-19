const { Consumer } = require('../Lib/EventHandler/consumer/consumer');

// NodeJS에서 extends는 상속하는데 사용한다
class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'recv.asset', partitions:0} ];
        super(kafkaHost, topics, options); // 부모 생성자 호출
        this.VC = VC; // vcModule
    }
    run(){
        console.log('[RUNNING] kafka consumer for VC is running');
        const that = this;
        this.consumer.on('message', function(message) {
            that.handler(message, that);
        });
    }
    handler(message, self){
        // TODO
        console.log(message);
        // 은주 누나의 지적: message를 바로 파싱했었는데 json 파싱을 하고 난 뒤 써야한다.
        const message_ = JSON.parse(message.value);
        console.log(message_);
        const event = message_.operation;
        const filepath = self.VC.vc.rp.related_to_filepath(message_.related) + '/' + message_.id + '.asset';
        self.VC.editFile(event, filepath, message_.content).then(() => {
            const commitMessage = 'a';
            self.VC.commit(self.VC, filepath, commitMessage, message_);
        });
    }
}

exports.vcConsumer = vcConsumer;