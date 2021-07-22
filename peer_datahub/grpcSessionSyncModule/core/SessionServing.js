var PROTO_PATH = __dirname + '/../protos/SessionSyncModule.proto';

var grpc = require('@grpc/grpc-js');
var protoLoader = require('@grpc/proto-loader');
var packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
var sessionSyncModule = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;

/**
 * Implements the SayHello RPC method.
 */
function SessionSetupRequest(call, callback) {
    // SetupRequest 메시지가 세션 매니저로부터 들어오면, 상대 노드로 Init Message를 서로 보냄.
    var target = call.request.dest_ip + ':' + call.request.dest_port
    var session = new sessionSyncModule.SessionSync(target, grpc.credentials.createInsecure());
    session.SessionInit(
        {transID : 'a1',
         PublishDatamap: 'publisheddatamapsample_FILE READ HERE'}, function(err, response){
            console.log("SessionSetupRequest SENT to " + target)
        }
    )
    // callback(null, {message: 'Hello ' + call.request.name});
}

function SessionInit(call, callback) {
    console.log("RECEIVED SessionConfigRequest of " + call.request.transID)
    console.log("HERE FOR SAVING " + call.request.publishDatamap)
    callback(null ,{transID: call.request.transID,
                    result: 0})
}

function ReturnACK(call, callback) {
    console.log("RECEIVED ACKMessage of " + call.request.transID + call.request.result)
}

function DatamapChangeEvent (call, callback) {
    // SetupRequest 메시지가 세션 매니저로부터 들어오면, 상대 노드로 Init Message를 서로 보냄.
    var target = call.request.dest_ip + ':' + call.request.dest_port
    var session = new sessionSyncModule.SessionSync(target, grpc.credentials.createInsecure());
    session.SessionInit(
        {transID : 'a1',
            PublishDatamap: 'publisheddatamapsample_FILE READ HERE'}, function(err, response){
            console.log("SessionSetupRequest SENT to " + target)
        }
    )
}

function ChangeSession (call, callback) {
}

function SendHealthCheck (call, callback) {
    console.log("RECEIVED SessionConfigRequest of " + call.request.transID)
    console.log("HERE FOR SAVING " + call.request.publishDatamap)
    callback(null ,{transID: call.request.transID,
        result: 0})

}

function ReceiveHealthCheck (call, callback) {
    console.log("RECEIVED SessionConfigRequest of " + call.request.transID)
    console.log("HERE FOR SAVING " + call.request.publishDatamap)
    callback(null ,{transID: call.request.transID,
        result: 0})
}

function DisconnectSession (call, callback) {

}


/**
 * Starts an RPC server that receives requests for the Greeter service at the
 * sample server port
 */
function main() {
    var server = new grpc.Server();
    server.addService(hello_proto.Greeter.service, {
        SessionSetupRequest: SessionSetupRequest,
        SessionInit: SessionInit,
        DatamapChangeEvent:DatamapChangeEvent
        },
        ReturnACK, ReturnACK);
    server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
        server.start();
    });
}

main();
