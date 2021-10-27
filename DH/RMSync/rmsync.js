
const { parentPort, workerData } = require('worker_threads');

const rm = require(__dirname+'/rmsync');


//RMSync
exports.RMSync = function(){

    parentPort.on('message', this._dhDaemonListener)

};

exports.RMSync.prototype.run = function(){

};

/* Worker threads Listener */
exports.RMSync.prototype._dhDaemonListener = function(message){
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

/* DHDaemon methods */
exports.RMSync.prototype._dmUpdateReferenceModel = function(){
    parentPort.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: null
    });
};

const rmSync = new rm.RMSync()
