const PROTO_PATH = __dirname + '/protos/dhdaemon.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const DS = require('./daemonServer');
const { parentPort, MessagePort, getEnvironmentData } = require('worker_threads');

// daemonServer
exports.dServer = function(){

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
};

// gRPC service function
exports.dServer.prototype.getDHList = function(call, callback){
    // TODO
};
exports.dServer.prototype.setInterest = function(call, callback){
    // TODO
};

exports.dServer.prototype.getDaemonServer = function(){
    var server = new grpc.Server();
    server.addService(this.ds.daemonServer.service, {
        getDHList: this.getDHList,
        setInterest: this.setInterest
    });
    return server;
};

// run daemonServer
const dServer = new DS.dServer();
const daemonServer = dServer.getDaemonServer();
daemonServer.bindAsync('0.0.0.0:'+ dServer.port,
    grpc.ServerCredentials.createInsecure(), () => {
        console.log('[RUNNING] DataHub daemon is running with '+ dServer.ip +':'+ dServer.port);
        daemonServer.start();
});

