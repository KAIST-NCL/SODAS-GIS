
var kafka = require('kafka-node')
var crypto = require('crypto')

var Producer = kafka.Producer
var KeyedMessage = kafka.KeyedMessage
var client = new kafka.KafkaClient()
var producer = new Producer(client)

var eventCount = parseInt(process.argv[2])

var topic = 'asset'
var eventMessage = require(__dirname+'/event.json')

producer.on('error', function(err) {})

producer.on('ready', function () {
    for (var i = 0; i < eventCount; i++) {
        eventMessage.id = crypto.randomBytes(20).toString('hex');

        var payloads = [
            {
                topic: topic,
                messages: JSON.stringify(eventMessage)
            }
        ];
        producer.send(payloads, function (err, data) {
            console.log(data);
        });
    }
});
