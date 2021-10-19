const PROTO_PATH = __dirname + '/protos/dhdaemon.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const DS = require('./daemonServer');
const { parentPort, MessagePort, getEnvironmentData, MessageChannel, workerData } = require('worker_threads');

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
    this.port = workerData.dm_portNum;
    this.ip = workerData.dm_ip;
    this.known_hosts = workerData.known_hosts;
};

// gRPC service function
dServer.prototype.getDHList = function(call, callback){
    // TODO
};
dServer.prototype.setInterest = function(call, callback){
    // TODO
};
dServer.prototype.test_func = function(){
    console.log('[TEST] Test function is called');
    console.log(this.known_hosts);
    // this.known_hosts = ['127.0.0.1'];
    console.log(this.known_hosts);
    parentPort.postMessage({event:'Test'});
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
ds.test_func();
