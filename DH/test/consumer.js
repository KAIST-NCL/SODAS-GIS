var kafka = require('kafka-node');
var Consumer = kafka.Consumer;
var Offset = kafka.Offset;
var Client = kafka.KafkaClient;
var topic = 'asset';

var client = new Client({ kafkaHost: '0.0.0.0:9092' });
var topics = [{ topic: topic, partition: 0 }];
var options = { autoCommit: false, fetchMaxWaitMs: 1000, fetchMaxBytes: 1024 * 1024 };

var consumer = new Consumer(client, topics, options);
var offset = new Offset(client);

consumer.on('message', function (message) {
    console.log(message);
    console.log(JSON.parse(message.value));
});

consumer.on('error', function (err) {
    console.log('error', err);
});
