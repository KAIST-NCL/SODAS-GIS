var kafka = require('kafka-node');
var Consumer = kafka.Consumer;
var Offset = kafka.Offset;
var Client = kafka.KafkaClient;
var hd = require('../../msgHandler');

// Master_Reference_Model
var topic1 = 'Master_Reference_Model';
var topic2 = 'Datahub';
var client = new Client({ kafkaHost: '0.0.0.0:9092' });
var topics = [{ topic: topic1, partitions: 0 },
              { topic: topic2, partitions: 1 }];

var options = {groupId: "ncl_test", commitOffsetsOnFirstJoin: false, autoCommit: false, fetchMaxWaitMs: 1000, fetchMaxBytes: 1024 * 1024 };
exports.consumer = new Consumer(client, topics, options);
var offset = new Offset(client);

exports.consumer = function consumer(kafkaHost, topics, options){

    this.client = new Client({kafkaHost: kafkaHost});
    this.topics = topics;
    this.options = options;
    this.consumer = new Consumer(this.client, topics, options);

};

exports.consumer.prototype.on_message = function(){
    this.consumer.consumer.on('message', function (message) {
    });
};

exports.consumer.prototype.on_error = function(cb){
    this.consumer.consumer.on('error', function(message){
    });
};

exports.vcListener = function(kafkaHost, topics, options){
    consumer.call(this, kafkaHost, topics, options);
};

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
    if(topic == topic1) {
        console.log('topic:',topic);
        if (msg.type == 'reference-model') {
            hd.refmodelhandler(msg.operation);
        } 
        else if (msg.type == 'domain') {
            hd.domainhandler(msg.operation);
        } 
        else if (msg.type == 'domain-version') {
            hd.domverhandler(msg.operation);
        } 
        else {
            console.log('undefined operation and type combination.');
        }
    }
    else if(topic == topic2) {
            console.log('topic:',topic);

            if(msg.type=='datahub'){
                hd.datahubhandler(msg.operation);
            } 
            else if(msg.operation=='create' && msg.type=='asset'){
                hd.assethandler(msg.operation, msg.related, msg.id, msg.contents, gitDIR, git);
            }
            else if(msg.operation=='update' && msg.type=='domain-asset'){
                hd.domassethandler(msg.operation);
            } 
            else if(msg.operation=='update' && msg.type=='taxonomy-asset'){
                hd.taxassethandler(msg.operation);
            } 
            else if(msg.operation=='update' && msg.type=='category-asset'){
                hd.categassethandler(msg.operation);
            } 
            else if(msg.operation=='update' && msg.type=='catalog-asset'){
                hd.catalassethandler(msg.operation);
            } 
            else if(msg.operation=='create' && msg.type=='catalog'){
                hd.cataloghandler(msg.operation);
            } 
            else {
            console.log('undefined operation and type combination.');
        }
    }
    else{
        console.log('no topic defined');
    }
};
