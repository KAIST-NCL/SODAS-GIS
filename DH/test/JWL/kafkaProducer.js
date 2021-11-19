var kafka = require('kafka-node')
var crypto = require('crypto')

var Producer = kafka.Producer
var KeyedMessage = kafka.KeyedMessage
var client = new kafka.KafkaClient()
var producer = new Producer(client)

var eventCount = parseInt(process.argv[2])

var topic = 'recv.asset'
var eventMessage = {
    "id":"A4",
    "operation": "UPDATE",
    "type": "asset",
    "related": [
        {
            operation: "UPDATE",
            id: "category00011",
            type: "category"
        },
        {
            operation: "UPDATE",
            id: "category0001",
            type: "category"
        },
        {
            operation: "UPDATE",
            id: "taxonomy000",
            type: "taxonomy"
        },
        {
            operation: "UPDATE",
            id: "domain01",
            type: "domain"
        }
    ],
    "contents": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rdf:RDF\nxmlns:skos=\"http://www.w3.org/2004/02/skos/core#\"\nxmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"\nxmlns:dct=\"http://purl.org/dc/terms/\"\nxmlns:dcat=\"http://www.w3.org/ns/dcat#\"\nxmlns:sodas=\"http://purl.org/etri/sodas#\"\n>\n\n</rdf:RDF>"
};


producer.on('error', function(err) {})

producer.on('ready', function () {
    for (var i = 0; i < eventCount; i++) {
        console.log(eventMessage)

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
