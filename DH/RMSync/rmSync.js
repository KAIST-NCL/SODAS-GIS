
const {Worker, parentPort, workerData} = require('worker_threads');
const rm = require(__dirname+'/rmSync');
const workerName = 'RMSync';

exports.RMSync = function() {

    this.referenceHub_ip = workerData.referenceHub_ip
    this.referenceHub_portNum = workerData.referenceHub_portNum

}

exports.RMSync.prototype.run = function() {

    parentPort.on('message', this.dhDaemonListener)

}

// [DHDaemon -> RMSync]
exports.RMSync.prototype.dhDaemonListener = function(message) {
    switch (message.event) {
        // RMSync 초기화
        case 'INIT':

            break;
    }
}

const rmSync = new rm.RMSync()
rmSync.run()
