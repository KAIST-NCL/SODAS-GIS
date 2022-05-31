const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;
const deasync = require('deasync');
const debug = require('debug')('sodas:kafka');

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
        debug('[RUNNING] Kafka consumer for control signal is running ');
        const that = this;
        this.consumer.on('message', function(message){

            // JSON parsing error
            try {
                const message_ = JSON.parse(message.value);
                const event = message_.operation;
                const msg = message_.content;
                that.eventSwitch(event, msg);
            } catch (e){
                debug(e);
                return;
            }
        });
    };
    eventSwitch = function(event, msg){
        switch(event){
            case 'START':
                this.daemon._rmSyncInit();
                debug('[Function Test / Init Process] START event');
                break;
            case 'UPDATE':
                debug(msg);
                debug(msg.interest.interest_list);
                debug(msg.interest.reference_model);
                this.daemon._dhSearchUpdateInterestTopic(msg.interest.interest_list);
                // this.daemon._vcUpdateReferenceModel(msg.interest.reference_model);
                debug('[Function Test / UPDATE Process] UPDATE event complete');
                break;
            case 'SYNC_ON':
                if (this.daemon._smSyncOn() === -1)
                    this.daemon._raiseError('UPDATE IS NOT YET COMPLETED');
                else
                    this.daemon._smSyncOn();
                break;
            default:
                break;
        }
    };
}


exports.ctrlProducer = function(kafkaHost){
    this.client = new kafka.KafkaClient({kafkaHost: kafkaHost});
    this.producer = new Producer(this.client);
    this.topic = 'recv.datahub';
};

exports.ctrlProducer.prototype.createCtrlTopics = async function(){
    // create topics for DHDaemon
    var IS_COMPLETED = false;
    await this.client.createTopics([
        { topic: 'recv.datahub', partitions: 1 , replicationFactor: 1},
        { topic: 'send.datahub', partitions: 1, replicationFactor: 1},
        { topic: 'recv.asset', partitions: 1 , replicationFactor: 1},
        { topic: 'send.asset', partitions: 1, replicationFactor: 1}],
        function (err, data) {
            debug('[SETTING] Complete to create ctrl topics');
            IS_COMPLETED = true;
        }
    );
    while ((IS_COMPLETED == false)){deasync.runLoopOnce();}
    debug('[Function Test / Init Process] creating control topics is completed');
};

exports.ctrlProducer.prototype._produce = function(msg){
    const payloads = [{ topic: this.topic, messages: msg , partition: 0}];
    this.producer.send(payloads, function(err, data){
        if(err) debug(err);
    });
};

exports.ctrlProducer.prototype.sendError = function(errorCode){
    this._produce({'operation':'ERROR', 'error_code': errorCode});
};

exports.ctrlProducer.prototype.sendUpdate = function(id, data){
    const msg = {'operation':'UPDATE', 'content':{'id':id, 'data':data}};
    debug('\x1b[36m%s\x1b[0m', '[Function Test / UPDATE REFERENCE MODEL Process] sending message to Kafka', msg);
    this._produce(msg);
};

exports.ctrlConsumer = ctrlConsumer;
