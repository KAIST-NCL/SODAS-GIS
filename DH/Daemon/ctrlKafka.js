const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;

class ctrlConsumer extends Consumer{
    constructor(kafkaHost, options, dhDaemon, conf){
        const topics = [ {topic:'send.datahub', partitions:0 } ];
        super(kafkaHost, topics, options);
        this.daemon = dhDaemon;
        this.conf = conf;
        this.referenceHubIP = conf.get('ReferenceHub', 'ip');
        this.referenceHubPort = conf.get('ReferenceHub', 'port');
    }
    onMessage = function(){
        console.log('[RUNNING] Kafka consumer for control signal is running ');
        const that = this;
        this.consumer.on('message', function(message){

            // JSON parsing error
            try {
                const message_ = JSON.parse(message.value);
                const event = message_.event;
                const msg = message_.value;
                that.eventSwitch(event, msg);
            } catch (e){
                console.log(e);
                return;
            }
        });
    };
    eventSwitch = function(event, msg){
        switch(event){
            case 'TEST':
                console.log(msg);
                this.daemon.daemonServer.postMessage({event:'TEST', data:{msg: 'test'}});
                break;
            case 'START':
                this.daemon.rmSync.postMessage({event:'INIT', data: {referenceHub_ip: this.referenceHubIP, referenceHub_port: this.referenceHubPort}});
                break;
            case 'UPDATE':
                this.daemon.dhSearch.postMessage({});
                break;
            case 'SYNC_ON':
                this.daemon.sessionManager.postMessage({});
                break;
            default:
                break;
        }
    };
}


exports.ctrlProducer = function(topic){
    this.client = new kafka.KafkaClient();
    this.producer = new Producer(this.client);
    this.topic = topic;
};

exports.ctrlProducer.produce = function(msg){
    const payloads = [{ topic: this.topic, messages: msg }];
    this.producer.send(payloads, function(err, data){
        if(err) console.log(err);
    });
};

exports.ctrlConsumer = ctrlConsumer;
