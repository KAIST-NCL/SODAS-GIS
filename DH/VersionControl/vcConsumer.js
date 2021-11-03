const { Consumer } = require('../Lib/EventHandler/consumer/consumer');

// NodeJS에서 extends는 상속하는데 사용한다
class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'recv.dmap', partitions:0} ];
        super(kafkaHost, topics, options); // 부모 생성자 호출
        this.VC = VC;
    }
    run(){
        console.log('[RUNNING] kafka consumer for VC is running');
        const that = this;
        this.consumer.on('message', this.handler);

    }
    handler(message){
        // TODO
        const event = message.operation;
        const filepath = this.VC.vcRoot + this.VC.rp.related_to_filepath(message.related) + '/' + message.id + '.asset';
        switch(event){
            case 'UPDATE':
                // file write
                this.VC.editFile(filepath, message.content);
                const commitNum = this.VC.commit(filepath, message);
                this.VC.reportCommit(filepath, assetID, commitNum);
                break;
            case 'DELETE':
                this.VC.deleteFile(filepath);
                break;

        }
    }
}

exports.vcConsumer = vcConsumer;
