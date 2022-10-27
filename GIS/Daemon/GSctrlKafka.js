const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;
const deasync = require('deasync');
const debug = require('debug')('sodas:GSkafka');

class ctrlConsumer extends Consumer{
    constructor(kafkaHost, options, gsDaemon, conf){
        const topics = [ 
            { topic: 'send.governanceSystem', partitions: 1 , replicationFactor: 1}
        ];
        super(kafkaHost, topics, options);
        this.daemon = gsDaemon;
        this.conf = conf;
        this.governanceSystemIP = conf.get('GovernanceSystem', 'ip');
        this.governanceSystemPort = conf.get('GovernanceSystem', 'port');
    }
    
    onMessage = function(){
        debug('[RUNNING] Kafka consumer for control signal is running ');
        const self = this;
        this.consumer.on('message', function(message){

            // JSON parsing error
            try {
                const topic_ = message.topic; // Grammer check needed
                const message_ = JSON.parse(message.value);
                switch(topic_) {
                    case 'send.governanceSystem':
                        self.governanceSystemHandler(message_);
                        break;
                    default:
                        debug("Wrong type of Kafka topic came in");
                        break;
                }
            } catch (e){
                debug(e);
                return;
            }
        });
    };

    // Topic: send.governacneSystem
    governanceSystemHandler = function(msg){
        // event Type: START / UPDATE / STOP
        const content = JSON.parse(msg.content);
        switch(msg.operation) {
            case 'START':
                debug("governanceSystem - START");
                this.daemon._rmSMInit();
                break;
            case 'UPDATE':
                debug("governanceSystem - UPDATE");
                break;
            case 'STOP':
                debug("governanceSystem - STOP");
                break;
            default:
                debug("Wrong type of operation");
                break;
        }
    };

    // create topics
    _createCtrolTopics = async function(){
        // create topics for DHDaemon
        var IS_COMPLETED = false;
        await this.consumer.client.createTopics([
            { topic: 'send.governanceSystem', partitions: 1 , replicationFactor: 1},
            { topic: 'send.referenceModel', partitions: 1 , replicationFactor: 1},
            { topic: 'send.dictionary', partitions: 1 , replicationFactor: 1}
        ],
            function (err, data) {
                debug('[SETTING] Complete to create ctrl topics');
                IS_COMPLETED = true;
            }
        );
        while ((IS_COMPLETED == false)){deasync.runLoopOnce();}
        debug('[Function Test / Init Process] creating control topics is completed');
    }
};

exports.ctrlConsumer = ctrlConsumer;