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
        debug('[LOG] Kafka Message for GS is received - ' + message.topic);
        // parsing 대상: type, content, publishingType
        // type: doamin, group, taxonomy, taxonomyVersion
        // publishingType: JSON, RDF
        const message_ = JSON.parse(message.value);
        const event = message_.operation;

        // topic에 따라 약간은 차별할 필요가 있다
        var tp;
        if (message.topic = 'send.referenceModel') tp = 'referenceModel';
        else if (message.topic = 'send.dictionary') tp = 'dictionary';

        var filepath = self.VC.vc.vcRoot + '/' + tp + '/' + message_.type+ '/'+ message_.id;
        
        // 양식 정하기
        if (message_.publishingType == 'SODAS') filepath = filepath + '.json';
        else if (message_.publishingType == 'rdf') filepath = filepath + '.rdf';

        // do the operation right away
        self.VC.editFile(event, filepath,message_.type, message_.content).then(() => {
            const commitMessage = message_.id;
            self.VC.commit(self.VC, filepath, commitMessage, message_);
        });
    }
}

exports.vcConsumer = vcConsumer;
