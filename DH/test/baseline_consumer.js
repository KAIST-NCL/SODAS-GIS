var kafka = require('kafka-node');
var fs = require('fs');
var vc = require('../Lib/git');
var gRPC_client = require('./gRPC/fileTransfer');

const simpleGit = require('simple-git');
var execSync = require('child_process').execSync;
const timeOut = 10;


var Consumer = kafka.Consumer;
var Offset = kafka.Offset;
var Client = kafka.KafkaClient;
var topic = 'asset';

var gitDIR = './gitDB';
var git;
var fileList = [];

async function create() {
    git = await vc.create(gitDIR);
    fs.writeFile('./gitDB/init.txt', 'init', 'utf8', function (error) {
        if (error) console.log("Error: ", err);
    });
    await vc.commit(git, 'init');
}

async function commit() {
    await vc.commit(git, "test").then((comm) => console.log(comm));
}

create();

console.log(git)

!fs.existsSync('./gitDB/DO1') && fs.mkdirSync('./gitDB/DO1');
!fs.existsSync('./gitDB/DO1/TX1') && fs.mkdirSync('./gitDB/DO1/TX1');
!fs.existsSync('./gitDB/DO1/TX1/CA1') && fs.mkdirSync('./gitDB/DO1/TX1/CA1');

var client = new Client({ kafkaHost: '0.0.0.0:9092' });
var topics = [{ topic: topic, partition: 0 }];
var options = { autoCommit: false, fetchMaxWaitMs: 1000, fetchMaxBytes: 1024 * 1024 };

var consumer = new Consumer(client, topics, options);
var offset = new Offset(client);

var flag = true

async function test (event, folder) {
    var filepath;
    if (event.operation == 'UPDATE' || event.operation == 'CREATE') {
        await vc.file_manager(vc.EDIT, gitDIR, folder, event.id, event.contents).then((value) => fileList.push(value.slice()))
        if (flag) {
            console.log(new Date().getTime())
            flag = false;
        }
    }
    else if (event.operation == 'DELETE') {
        await vc.file_manager(vc.DEL, gitDIR, folder, event.id, event.contents).then((value) => fileList.push(value.slice()))
        if (flag) {
            console.log(new Date().getTime())
            flag = false;
        }
    }
}

consumer.on('message', function (message) {

    var event = JSON.parse(message.value);

    var folder = '/' + event.related.domain + '/' + event.related.taxonomy + '/';
    event.related.category.forEach(function(item, index) {
        folder = folder + item + '/';
    });

    test(event, folder);
});

consumer.on('error', function (err) {
    console.log('error', err);
});

function run(){
    while (typeof fileList[0] !== 'undefined') {
        gRPC_client.fileTrasnfer('0.0.0.0:50000', fileList.shift())
    }
    setTimeout(run, timeOut);
}
setTimeout(run, timeOut);
