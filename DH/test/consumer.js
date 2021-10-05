var kafka = require('kafka-node');
var vc = require('../Lib/versionControl');

var Consumer = kafka.Consumer;
var Offset = kafka.Offset;
var Client = kafka.KafkaClient;
var topic = 'asset';
var gitDIR = __dirname + '/gitDB'
const git = vc.create(gitDIR);

var client = new Client({ kafkaHost: '0.0.0.0:9092' });
var topics = [{ topic: topic, partition: 0 }];
var options = { autoCommit: false, fetchMaxWaitMs: 1000, fetchMaxBytes: 1024 * 1024 };

var consumer = new Consumer(client, topics, options);
var offset = new Offset(client);

consumer.on('message', function (message) {
    console.log(message);
    var event = JSON.parse(message.value);

    var folder = '/' + event.related.domain + '/' + event.related.taxonomy + '/';
    event.related.category.forEach(function(item, index) {
        folder = folder + item + '/';
    });

    if (event.operation == 'UPDATE' || event.operation == 'CREATE') {
        vc.file_manager(vc.EDIT, gitDIR, folder, event.id, event.contents)
    }
    else if (event.operation == 'DELETE') {
        vc.file_manager(vc.DEL, gitDIR, folder, event.id, event.contents)
    }

    vc.commit(git, "test")
});

consumer.on('error', function (err) {
    console.log('error', err);
});
