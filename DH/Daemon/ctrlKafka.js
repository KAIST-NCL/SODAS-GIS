const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;

class ctrlConsumer extends Consumer{
    constructor(kafkaHost, options, dhDaemon, conf){
        const topics = [ {topic:'send.control', partitions:0 } ];
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
            const event = message.event;
            const msg = message.value;
            that.eventSwitch(event, msg);
        });
    };
    eventSwitch = function(event, msg){
        switch(event){
            case 'START':
                this.daemon.rmSync.postMessage({'type':'INIT', 'referenceHub_ip': this.referenceHubIP, 'referenceHub_port': this.referenceHubPort});
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
