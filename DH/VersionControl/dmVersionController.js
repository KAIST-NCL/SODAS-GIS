// Import Library
var consumer = require('../Lib/EventHandler/consumer/consumer');
var vc = require('../Lib/versionControl');

// Git variables
const gitDIR = './gitDB'
const git = vc.create(gitDIR)

// Recieve message and handle it
consumer.consumer.on('message', function (message) {
    console.log(message)
    const topic_msg = message.topic;
    const rcv_msg = JSON.parse(message.value);
    consumer.apiSwitcher(topic_msg, rcv_msg, gitDIR, git);
    console.log(rcv_msg.operation);
});
consumer.consumer.removeTopics([topic2 ], function(err, removed){});

consumer.on('error', function (err) {
    console.log('error', err);
});