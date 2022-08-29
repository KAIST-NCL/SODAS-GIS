const kafka = require('kafka-node');
const hd = require('../../msgHandler');

// Consumer class
class Consumer {
    constructor(kafkaHost, topics, options){
        this.client = new kafka.KafkaClient({kafkaHost: kafkaHost});
        this.topics = topics;
        this.options = options;
        this.consumer = new kafka.Consumer(this.client, topics, options);
    }
}
exports.Consumer = Consumer;

// Version Control Listener
class vcListener extends Consumer{
    constructor(kafkaHost, topics, options){
        super(kafkaHost, topics, options);
        this.topic1 = 'Master_Reference_Model';
        this.topic2 = 'Datahub';
    }
}
exports.vcListener = vcListener;
exports.vcListener.prototype.on_message = function(){
    this.consumer.consumer.on('message', function (message) {
        const topic_msg = message.topic;
        const rcv_msg = JSON.parse(message.value);
        this.prototype.apiSwitcher(topic_msg, rcv_msg, gitDIR, git);
    });
};

exports.vcListener.prototype.on_error = function(){
    this.consumer.consumer.on('error', function(message){
    });
};

// to switch
exports.vcListener.prototype.apiSwitcher = async function(topic, msg, gitDIR, git){
    if(topic === this.topic1) {
        console.log('topic:',topic);
        if (msg.type === 'reference-model') hd.refmodelhandler(msg.operation);
        else if (msg.type === 'domain') hd.domainhandler(msg.operation);
        else if (msg.type === 'domain-version') hd.domverhandler(msg.operation);
        else console.log('undefined operation and type combination.');
    }
    else if(topic === this.topic2) {
            console.log('topic:',topic);
            if(msg.type ==='datahub') hd.datahubhandler(msg.operation);
            else if(msg.operation ==='create' && msg.type ==='asset') hd.assethandler(msg.operation, msg.related, msg.id, msg.contents, gitDIR, git);
            else if(msg.operation ==='update' && msg.type ==='domain-asset') hd.domassethandler(msg.operation);
            else if(msg.operation ==='update' && msg.type ==='taxonomy-asset') hd.taxassethandler(msg.operation);
            else if(msg.operation ==='update' && msg.type ==='category-asset') hd.categassethandler(msg.operation);
            else if(msg.operation ==='update' && msg.type ==='catalog-asset') hd.catalassethandler(msg.operation);
            else if(msg.operation ==='create' && msg.type ==='catalog') hd.cataloghandler(msg.operation);
            else console.log('undefined operation and type combination.');
    }
    else{
        console.log('no topic defined');
    }
};
