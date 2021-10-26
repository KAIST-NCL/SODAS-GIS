const { Consumer } = require('../Lib/EventHandler/consumer/consumer');

class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'recv.dmap', partitions:0} ];
        super(kafkaHost, topics, options);
        this.VC = VC;
    }
    run(){
        console.log('[RUNNING] kafka consumer for VC is running');
        const that = this;
        this.consumer.on('message', this.handler);

    }
    handler(message){
        // TODO
        const event = message.event;
        switch(event){
            case 'UPDATE':
                // file write
                const commitNum = this.VC.commit(filepath, message);
                this.VC.reportCommit(filepath, assetID, commitNum);
                break;
            case 'DELETE':
                break;

        }
    }
}

exports.vcConsumer = vcConsumer;
