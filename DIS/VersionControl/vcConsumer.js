const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const debug = require('debug')('sodas:vcConsumer');

class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'send.asset', partitions:0} ];
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
