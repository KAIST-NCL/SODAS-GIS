var kafka = require('kafka-node');
var Consumer = kafka.Consumer;
var Offset = kafka.Offset;

var Client = kafka.KafkaClient;

// Master_Reference_Model
var topic1 = 'Master_Reference_Model';
var topic2 = 'Datahub';
var client = new Client({ kafkaHost: '0.0.0.0:9092' });
var topics = [{ topic: topic1, partitions: 0 },
              { topic: topic2, partitions: 1 }];

var options = {groupId: "ncl_test", commitOffsetsOnFirstJoin: false, autoCommit: false, fetchMaxWaitMs: 1000, fetchMaxBytes: 1024 * 1024 };
exports.consumer = new Consumer(client, topics, options);
var offset = new Offset(client);

function ckpt(){
    console.log('check')
}

// to switch
exports.apiSwitcher = async function(topic, msg, gitDIR, git){
    if(topic ==topic1) {
        console.log('topic:',topic);
        if (msg.operation == 'start' && msg.type == 'reference-model') {
            //pass
        } else if (msg.operation == 'stop' && msg.type == 'reference-model') {
            //pass
        } else if (msg.operation == 'create' && msg.type == 'domain') {
            //pass
        } else if (msg.operation == 'update' && msg.type == 'domain') {
            //pass
        } else if (msg.operation == 'create' && msg.type == 'domain-version') {
            //pass
        } else if (msg.operation == 'update' && msg.type == 'domain-version') {
            //pass
        } else {
            console.log('undefined operation and type combination.');
        }
    }
    else if(topic == topic2) {
            console.log('topic:',topic);

            if(msg.operation=='start' && msg.type=='datahub'){
                //pass
            } else if(msg.operation=='update' && msg.type=='datahub'){
                //pass
            } else if(msg.operation=='stop' && msg.type=='datahub'){
                //pass
            } else if(msg.operation=='create' && msg.type=='asset'){
                // first create the asset in the proper folder
                vc.file_manager(vc.EDIT, gitDIR, msg.hierarchy, msg.id, msg.contents)
                // then commit
                var comm_commit = 0;
                await vc.commit(git, "create asset " + msg.id).then((comm) => comm_commit = comm.slice());
                // return the commit number to 
                
            } else if(msg.operation=='update' && msg.type=='asset'){
                // first create the asset in the proper folder
                vc.file_manager(vc.EDIT, gitDIR, msg.hierarchy, msg.id, msg.contents)
                // then commit
                var comm_commit = 0;
                await vc.commit(git, "update asset " + msg.id).then((comm) => comm_commit = comm.slice());
                // return the commit number to 

            } else if(msg.operation=='update' && msg.type=='domain-asset'){
                //pass
            } else if(msg.operation=='update' && msg.type=='taxonomy-asset'){
                //pass
            } else if(msg.operation=='update' && msg.type=='category-asset'){
                //pass
            } else if(msg.operation=='update' && msg.type=='catalog-asset'){
                //pass
            } else if(msg.operation=='delete' && msg.type=='asset'){
                // first create the asset in the proper folder
                vc.file_manager(vc.DEL, gitDIR, msg.hierarchy, msg.id, msg.contents)
                // then commit
                var comm_commit = 0;
                await vc.commit(git, "create asset " + msg.id).then((comm) => comm_commit = comm.slice());
                // return the commit number to 
                
            } else if(msg.operation=='create' && msg.type=='catalog'){
                //pass
            } else if(msg.operation=='update' && msg.type=='catalog'){
                //pass
            } else if(msg.operation=='delete' && msg.type=='catalog'){
                //pass
            } else if(msg.operation=='sync_on' && msg.type=='datahub'){
                //pass
            } else if(msg.operation=='sync_off' && msg.type=='datahub'){
                //pass
            } else {
            console.log('undefined operation and type combination.');
        }
    }
    else{
        console.log('no topic defined');
    }
}

consumer.on('message', function (message) {
    console.log(message);
    // const topic_msg = message.topic;
    // const rcv_msg = JSON.parse(message.value);
    // apiSwitcher(topic_msg, rcv_msg);
    // console.log(rcv_msg.operation);
});
consumer.removeTopics([topic2 ], function(err,removed){});

consumer.on('error', function (err) {
  console.log('error', err);
});
