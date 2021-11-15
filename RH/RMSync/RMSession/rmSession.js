
const { parentPort, workerData } = require('worker_threads');
const PROTO_PATH = __dirname+'/../proto/rmSync.proto';
const rmSess = require(__dirname+'/rmSession');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader')
const fs = require("fs");

exports.RMSession = function () {

    parentPort.on('message', this._rmSmListener);

    this.dh_rm_sync_ip = workerData.ip + ':' + workerData.port;
    this.session_id = workerData.session_id;

    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.rmSyncproto = this.protoDescriptor.RMSync.RMSyncBroker;
    this.rmSyncClient = new this.rmSyncproto(this.dh_rm_sync_ip, grpc.credentials.createInsecure());

    console.log('[SETTING] RMSession is running with %s', this.session_id);
}

exports.RMSession.prototype._referenceModelSync = function () {
    let referenceModelDir = __dirname+'/reference-model/domain'

    fs.readFile( referenceModelDir + '/domain01.rdf' , (err, data) => {
        if (err) throw err
        rmSession.rmSyncClient.ReferenceModelSync({
                id: 'domain01.rdf',
                file: data
            }, (err, response) => {
                console.log('Received Message:', response);
            })
    })
}

exports.RMSession.prototype.run = function () {
    this._referenceModelSync()
}

/* Worker threads Listener */
exports.RMSession.prototype._rmSmListener = function(message){
    switch (message.event) {
        case 'INIT':
            break;
        default:
            console.log('[ERROR] DH Daemon Listener Error ! event:', message.event);
            break;
    };
};

const rmSession = new rmSess.RMSession()
rmSession.run()
