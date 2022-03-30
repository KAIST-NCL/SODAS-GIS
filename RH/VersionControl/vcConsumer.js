const { Consumer } = require('../../DH/Lib/EventHandler/consumer/consumer');
const debug = require('debug')('sodas:vcConsumer');

class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'recv.rdf', partitions:0} ];
        super(kafkaHost, topics, options); 
        this.VC = VC; 
    }
    run(){
        debug('[RUNNING] kafka consumer for VC is running');
        const that = this;
        this.consumer.on('message', function(message) {
            that.handler(message, that);
        });
    }
    handler(message, self){
        debug('[LOG] Kafka Message for RH is received');
        const message_ = JSON.parse(message.value);
        const event = message_.operation;
        const filepath = self.VC.vc.vcRoot + '/' + message_.type+ '/'+ message_.id + '.rdf';
        console.log(message_.operation+' '+ filepath);
        // Changed Logs - > Previous: editFile and then commit right away
        // Changed Logs - > Now: editFile only. Commit is done with some period
        self.VC.editFile(event, filepath,message_.type, message_.contents);
        self.VC.count = self.VC.count + 1;
    }
}

exports.vcConsumer = vcConsumer;
