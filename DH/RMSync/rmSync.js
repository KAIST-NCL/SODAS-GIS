
const { parentPort, workerData } = require('worker_threads');

const rm = require(__dirname+'/rmsync');


//RMSync
exports.RMSync = function(){

    parentPort.on('message', this.dhDaemonListener)

};

exports.RMSync.prototype.run = function(){

};

// [DHDaemon -> RMSync]
exports.RMSync.prototype.dhDaemonListener = function(message){
    switch (message.event) {
        // RMSync 초기화
        case 'INIT':
            rmSync.run()
            break;
        default:
            console.log('[ERROR] DH Daemon Listener Error ! event:', message.event);
            break;
    }
};

const rmSync = new rm.RMSync()
