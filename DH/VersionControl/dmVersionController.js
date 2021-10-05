// Import Library
var consumer = require('../Lib/EventHandler/consumer/consumer');
var vc = require('../Lib/versionControl');

// Git variables
const gitDIR = './gitDB';
const git = vc.create(gitDIR);

// Create file-tree

// Receive message and handle it
consumer.consumer.on('message', function (message) {
    const topic_msg = message.topic;
    const rcv_msg = JSON.parse(message.value);
    consumer.apiSwitcher(topic_msg, rcv_msg, gitDIR, git);
});

consumer.consumer.on('error', function (err) {
    console.log('error', err);
});