var kafka = require('kafka-node'),
    Producer = kafka.Producer,
    KeyedMessage = kafka.KeyedMessage,
    client = new kafka.KafkaClient(),
    producer = new Producer(client),
    // payloads = [
    //     { topic: 'hi_test',
    //         messages: JSON.stringify(require('/home/ncl/test/dummy_data/data1.json'))}, // to send JSON file as messages
    //     { topic: 'hi_test2', messages: ['hello2'] }
    payloads = [
        { topic: 'Master_Reference_Model',
            messages: JSON.stringify(require('/home/ncl/test/dummy_data/data1.json'))}, // to send JSON file as messages
        { topic: 'Datahub', messages: ['hello2'] }
    ];
producer.on('error', function(err) {})

producer.on('ready', function () {
    producer.send(payloads, function (err, data) {
        console.log(data);
    });
});


// var kafka = require('kafka-node'),
//     Producer = kafka.Producer,
//     KeyedMessage = kafka.KeyedMessage,
//     client = new kafka.KafkaClient(),
//     producer = new Producer(client),
//     km = new KeyedMessage('key', 'message'),
//     payloads = [
//         { topic: 'Master_Reference_Model',
//             messages: 'hi,there', partition: 0,error:'what' },
//         { topic: 'Datahub', messages: ['hello2', 'world2', km] }
//     ];
// producer.on('error', function(err) {})
//
// producer.on('ready', function () {
//     producer.send(payloads, function (err, data) {
//         console.log(data);
//     });
// });
