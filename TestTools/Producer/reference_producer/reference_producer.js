const fs = require('fs');
const path = require('path');

const refFolder = Object.freeze({
    domain: 'domain',
    group: 'group',
    taxonomy: 'taxonomy',
    taxonomyVersion: 'taxonomyVersion'
});

var rootFolder = __dirname + '/../../referenceModels_example'
var filename = process.argv[2]; // input File Name in example folder ex) 03-domain/domain01.json

var type_of_file = function(filepath) {
    var fullDir = path.dirname(filepath);
    var upperDir = fullDir.split(path.sep).pop();
    return upperDir;
    // switch (upperDir) {
    //     case refFolder.domain:
    //         return "domain"
    //     case refFolder.group:
    //         return "group"
    //     case refFolder.taxonomy:
    //         return "taxonomy"
    //     case refFolder.taxonomyVersion:
    //         return "taxonomyVersion"
    //     default:
    //         debug('Not the target Folder: ' + filepath);
    //         break;
    // }
}

// 인풋 파일을 읽어와서 type, id, content를 읽는다
var eventMessage = {
    "operation": "UPDATE",
    "type": type_of_file(filename),
    "id": path.basename(filename, ".json"),
    "content": fs.readFileSync(rootFolder+'/'+filename).toString(),
    "publishingType": "SODAS",
    "timestamp": 1627952380
}

console.log(JSON.stringify(eventMessage));