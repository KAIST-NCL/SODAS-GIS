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
        // 은주 누나의 지적: message를 바로 파싱했었는데 json 파싱을 하고 난 뒤 써야한다.
        const message_ = JSON.parse(message);
        const event = message_.operation;
        const filepath = this.VC.vcRoot + this.VC.rp.related_to_filepath(message_.related) + '/' + message_.id + '.asset';
        const commitMessage = '';
        switch(event){
            case 'UPDATE':
                // file write
                this.VC.editFile(filepath, message_.content);
                const commitNum = this.VC.commit(filepath, commitMessage);
                this.VC.reportCommit(filepath, assetID, commitNum);
                break;
            case 'DELETE':
                this.VC.deleteFile(filepath);
                break;

        }
    }
}

exports.vcConsumer = vcConsumer;