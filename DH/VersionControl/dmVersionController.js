var fs = require('fs');
// Import Library
var consumer = require('../Lib/EventHandler/consumer/consumer');
var vc = require('../Lib/versionControl');

const {Worker, parentPort, MessagePort, workerData} = require('worker_threads');
var SM = workerData['sm_port'];

SM.postMessage({
    event: "UPDATE_PUB_ASSET",
    data: this.sessionList
});


// // Git variables
// const gitDIR = './gitDB';
// let git;
//
// async function create() {
//     git = await vc.create(gitDIR);
// }
//
// create();
//
// // Create file-tree
// !fs.existsSync('./DO1') && fs.mkdirSync('./DO1');
// !fs.existsSync('./DO1/TX1') && fs.mkdirSync('./DO1/TX1');
// !fs.existsSync('./DO1/TX1/CA1') && fs.mkdirSync('./DO1/TX1/CA1');
//


// // Receive message and handle it
// consumer.consumer.on('message', function (message) {
//     const topic_msg = message.topic;
//     const rcv_msg = JSON.parse(message.value);
//     consumer.apiSwitcher(topic_msg, rcv_msg, gitDIR, git);
// });
//
// consumer.consumer.on('error', function (err) {
//     console.log('error', err);
// });
