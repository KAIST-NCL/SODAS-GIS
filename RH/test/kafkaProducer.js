var kafka = require('kafka-node')
const fs = require('fs');
const { Console } = require('console');

var Producer = kafka.Producer
var KeyedMessage = kafka.KeyedMessage
var client = new kafka.KafkaClient()
var producer = new Producer(client)

// program evnettype eventcount
var eventCount = parseInt(process.argv[3]);
var eventType = process.argv[2]; // Create/Update

const log_file = __dirname+'/log.txt';

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


var topic = 'recv.rdf'

var fd = fs.openSync(log_file, 'a+');

var tmp = fs.readFileSync(fd, 'utf8').toString();

var file_content = JSON.parse('[' + tmp.slice(1,tmp.length) + ']');

var payload_list = [];

for (var i = 0; i < eventCount; i++) {
    types=["domain","domain_version"];
    names=["domain","domain_version"];
    chosen_idx= Math.floor(Math.random() * types.length);
    if (eventType == 'CREATE') {
        var rdf_file = names[chosen_idx]+'_id_'+(Math.floor(Math.random()*10)).toString();
        var type = types[chosen_idx];
        var to_append = ',' + JSON.stringify({id: rdf_file,type:type})+'\n';
        fs.appendFileSync(fd,to_append,'utf8');
        content=rdf_content_generator();
    }

    else if (eventType == 'UPDATE') {
        // random select among file_content
        var selected = file_content[Math.floor(Math.random() * file_content.length)];
        var rdf_file = selected.id;
        var type = selected.type;
        content=rdf_content_generator();
    }

    else if (eventType == 'DELETE') {
        // random select among file_content
        selected=file_content[Math.floor(Math.random() * file_content.length)];
        while (selected.type != 'domain') {
            var selected = file_content[Math.floor(Math.random() * file_content.length)];
        }
        var rdf_file = selected.id;
        var type = selected.type;
        content="";
    }

    var eventMessage = {
        "id":rdf_file,
        "operation": eventType,
        "type": type,
        "contents": content,
        "publishingType": "SODAS",
        "timestamp": Date.now().toString()
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
            //console.log("send:",payloads);
        });
    }
});

fs.closeSync(fd);