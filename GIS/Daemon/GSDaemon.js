const gs = require('./daemon');
const kafka = require('kafka-node');

const debug = require('debug')('sodas:GSDaemon');


const daemon = new gs.GSDaemon();
daemon.init()
    .then(() => {
        debug('[SETTING] daemon init is complete')
        daemon.run();
    });

process.on('SIGINT', () => {
    daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    daemon.stop();
    process.exit();
});
