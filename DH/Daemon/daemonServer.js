const PROTO_PATH = __dirname + '/protos/dhdaemon.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const DS = require('./daemonServer');
const { parentPort, MessagePort, getEnvironmentData, MessageChannel } = require('worker_threads');

// daemonServer
dServer = function(){

    // grpc option
    var packageDefinition = protoLoader.loadSync(
        PROTO_PATH,
        {keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.ds = this.protoDescriptor.daemonserver;
    this.port = getEnvironmentData('dm_port');
    this.ip = getEnvironmentData('dm_ip');
    const { port1, port2 } = new MessageChannel();
    this.DHSearchListeningPort = port1;
    this.DHSearch_port2 = port2;
};

// gRPC service function
dServer.prototype.getDHList = function(call, callback){
    // TODO
};
dServer.prototype.setInterest = function(call, callback){
    // TODO
};

dServer.prototype.daemon_on_message = function(value){
    // on_message for DHDaemon (Parent node)
    // parsing value and call proper action.
    if (value.port) {
        this.DHSearchPort = value.port;
        this.DHSearchPort.postMessage({msg:'i am worker2!'});// send msg to worker1
        console.log('[dServer] dhSearch MSG channel setting is complete');
   }
};

dServer.prototype.getDaemonServer = function(){
    var server = new grpc.Server();
    server.addService(this.ds.daemonServer.service, {
        getDHList: this.getDHList,
        setInterest: this.setInterest
    });
    return server;
};

exports.dServer = dServer;

// run daemonServer
const ds = new DS.dServer();
const daemonServer = ds.getDaemonServer();
daemonServer.bindAsync('0.0.0.0:'+ ds.port,
    grpc.ServerCredentials.createInsecure(), () => {
        console.log('[RUNNING] DataHub daemon is running with '+ ds.ip +':'+ ds.port);
        daemonServer.start();
});

// setting portInfo
parentPort.postMessage({
    port: ds.DHSearch_port2,
}, [ds.DHSearch_port2]);

// setting event listener for DHDaemon
parentPort.on('message', dServer.prototype.daemon_on_message);
// setting DHSearchPort
ds.DHSearchListeningPort.on('message', value => {
    console.log('[dServer: msg-print]' + value.msg);
});
