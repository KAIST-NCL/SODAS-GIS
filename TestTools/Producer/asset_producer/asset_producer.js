const ran = require('ranjs');
const fs = require('fs');
const {ref_parser} = require('./ref_parser');

// program evnettype eventcount
var eventType = process.argv[2]; // Create/Update/Clean

const log_file = __dirname+'/log.txt';

// 예시 referenceModel이 들은 폴더
const referenceModelFolder = __dirname + '/../../referenceModels_example';
const rp = new ref_parser(referenceModelFolder);
rp.test(referenceModelFolder);

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

var fd = fs.openSync(log_file, 'a+');

var tmp = fs.readFileSync(fd, 'utf8').toString();

var file_content = JSON.parse('[' + tmp.slice(1,tmp.length) + ']');

if (eventType == 'CREATE') {
    
    // rp에 들어가있는 목록 중 category 아이템 하나를 랜덤으로 정하고 해당 category의 related를 뽑아낸다
    const categories = [...rp.refItems.category.keys()];
    var random_category = categories[Math.floor(Math.random() * categories.length)];

    var related = rp.search_related(random_category);
    
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

else if (eventType == 'CLEAN') {
    // delete log.txt
    fs.unlinkSync('./log.txt');
    return 0;
}

else {
    console.log(" Require at least one Option ");
    console.log(" Supports Three Options ");
    console.log(" CREATE / UPDATE / CLEAN ");
    console.log(" Usage: node asset_producer.js Option ");
    return 1;
}

var eventMessage = {
    "id":id,
    "operation": "UPDATE",
    "type": "asset",
    "related": related,
    "content": rdf_content_generator().toString()
};

console.log(JSON.stringify(eventMessage));

fs.closeSync(fd);
