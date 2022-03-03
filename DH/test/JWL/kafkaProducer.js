var kafka = require('kafka-node')
const fs = require('fs');

var Producer = kafka.Producer
var KeyedMessage = kafka.KeyedMessage
var client = new kafka.KafkaClient()
var producer = new Producer(client)

// program evnettype eventcount
var eventCount = parseInt(process.argv[3]);
var eventType = process.argv[2]; // Create/Update

const log_file = __dirname+'/log.txt';

var related_list = [
    {data: {
        operation: "UPDATE",
        id: "domain01",
        type: "domain"
        }, 
    next: ['taxonomy000']
    },
    {data: {
        operation: "UPDATE",
        id: "taxonomy000",
        type: "taxonomy"
        }, 
    next: ['category0000','category0001'] 
    },
    {data: {
        operation: "UPDATE",
        id: "category0000",
        type: "category"
        },
    next: []
    },
    {data: {
        operation: "UPDATE",
        id: "category0001",
        type: "category"
        },
    next: ['category00011']
    },
    {data: {
        operation: "UPDATE",
        id: "category00011",
        type: "category"
        },
    next: []
    }
]

function random_next(previous) {
    var returnvalue = {
        next: -1,
        data: {},
    };

    returnvalue.data = previous.data;

    var val = (previous.data.type === 'category') ? previous.next.length + 1 : previous.next.length;


    if(previous.next.length > 0 ) {
        var random_index = Math.floor(Math.random() * (val));
        if (random_index < previous.next.length) {
            returnvalue.next = related_list.findIndex(it => it.data.id === previous.next[random_index]);
        }        
    }

    return returnvalue;
}

function rdf_content_generator() {
    var content_a = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:skos="http://www.w3.org/2004/02/skos/core#"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:dct="http://purl.org/dc/terms/"
    xmlns:dcat="http://www.w3.org/ns/dcat#"
    xmlns:sodas="http://purl.org/etri/sodas#"
>

<rdf:Description rdf:about="https://sodas.etri.re.kr/asset/dataset001">
    <rdf:type rdf:resource="http://www.w3.org/ns/dcat#Dataset"/>
    <dct:identifier>dataset001</dct:identifier>
    <dct:title xml:lang="en">dataset one</dct:title>
    <sodas:title>dataset one</sodas:title>
    <dct:description xml:lang="en">description of dataset 001</dct:description>
    <dct:publisher rdf:resource="http://sodas.etri.re.kr/org1"/>
    <dct:language rdf:resource="http://id.loc.gov/vocabulary/iso639-1/en"/>
    <dct:accrualPeriodicity rdf:resource="http://purl.org/cld/freq/daily"/>
    <dcat:keyword xml:lang="en">keyword1</dcat:keyword>
`
    
    var keyword2 = Math.random().toString(36).slice(2);
    
    var content_b = '<dcat:keyword xml:lang="ko">' + keyword2 + '</dcat:keyword>';

    var content_c = `
    <dct:accessRights rdf:resource="http://purl.org/eprint/accessRights/OpenAccess"/>
    <dct:issued>2021-06-07T14:19:09.288Z</dct:issued>
    <dct:modified>2021-06-07T15:19:09.100Z</dct:modified>
    <dcat:theme rdf:resource="https://sodas.etri.re.kr/category/category0000"/>
    <dcat:distribution rdf:resource="https://sodas.etri.re.kr/asset/distribution0011"/>
</rdf:Description>
<rdf:Description rdf:about="https://sodas.etri.re.kr/asset/distribution0011">
    <rdf:type rdf:resource="http://www.w3.org/ns/dcat#Distribution"/>
    <dct:title xml:lang="en">distribution0011</dct:title>
    <dcat:byteSize rdf:datatype="xsd:decimal">5120</dcat:byteSize>
    <dcat:mediaType rdf:resource="https://www.iana.org/assignments/media-types/text/csv"/>
    <dct:issued>2021-06-07T14:19:09.288Z</dct:issued>
    <dct:modified>2021-06-07T15:19:09.100Z</dct:modified>
</rdf:Description>

</rdf:RDF>
`;

    return content_a+content_b+content_c;
}

var domain_list = related_list.filter(it => it.data.type === 'domain');

var topic = 'recv.asset'

var fd = fs.openSync(log_file, 'a+');

var tmp = fs.readFileSync(fd, 'utf8').toString();

var file_content = JSON.parse('[' + tmp.slice(1,tmp.length) + ']');

var payload_list = [];

for (var i = 0; i < eventCount; i++) {
    if (eventType == 'CREATE') {
        var related = [];

        var current = (domain_list[Math.floor(Math.random() * domain_list.length)]);
        
        while (1) {
            var next = random_next(current);
            related.push(next.data);

            if (next.next === -1) break;
            else {
                current = related_list[next.next];
            }
        }

        var id = Math.random().toString(36).slice(2, 7);

        var to_append = ',' + JSON.stringify({id: id, related: related})+'\n';

        fs.appendFileSync(fd,to_append,'utf8');

    }

    else if (eventType == 'UPDATE') {
        // random select among file_content
        var selected = file_content[Math.floor(Math.random() * file_content.length)];
        var id = selected.id;
        var related = selected.related;        
    }

    var eventMessage = {
        "id":id,
        "operation": "UPDATE",
        "type": "asset",
        "related": related,
        "contents": rdf_content_generator()
    };

    payload_list.push(eventMessage);
}

producer.on('error', function(err) {})

producer.on('ready', function () {
    for (var i=0; i<eventCount; i++) {
        var payloads = [
            {
                topic: topic,
                messages: JSON.stringify(payload_list[i])
            }
        ];
        producer.send(payloads, function (err, data) {
            console.log("send:",data);
        });
    }
});

fs.closeSync(fd);