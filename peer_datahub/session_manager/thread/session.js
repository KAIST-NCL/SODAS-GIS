
const {parentPort} = require('worker_threads');
let workerName;
let port;

// var PROTO_PATH = __dirname + '/../protos/SessionSyncModule.proto';
//
// var grpc = require('@grpc/grpc-js');
// var protoLoader = require('@grpc/proto-loader');
// const policy = require("../policy/sync_policy");
// var packageDefinition = protoLoader.loadSync(
//     PROTO_PATH,
//     {keepCase: true,
//         longs: String,
//         enums: String,
//         defaults: true,
//         oneofs: true
//     });
// var sessionSyncModule = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;
//
// /**
//  * Implements the SayHello RPC method.
//  */
// function SessionSetupRequest(call, callback) {
//     // SetupRequest 메시지가 세션 매니저로부터 들어오면, 상대 노드로 Init Message를 서로 보냄.
//     var target = call.request.dest_ip + ':' + call.request.dest_port
//     var session = new sessionSyncModule.SessionSync(target, grpc.credentials.createInsecure());
//     session.SessionInit(
//         {transID : 'a1',
//             PublishDatamap: 'publisheddatamapsample_FILE READ HERE'}, function(err, response){
//             console.log("SessionSetupRequest SENT to " + target)
//         }
//     )
//     // callback(null, {message: 'Hello ' + call.request.name});
// }
//
// function SessionInit(call, callback) {
//     console.log("RECEIVED SessionConfigRequest of " + call.request.transID)
//     console.log("HERE FOR SAVING " + call.request.publishDatamap)
//     callback(null ,{transID: call.request.transID,
//         result: 0})
// }
//
// function ReturnACK(call, callback) {
//     console.log("RECEIVED ACKMessage of " + call.request.transID + call.request.result)
// }
//
// function DatamapChangeEvent (call, callback) {
//     // SetupRequest 메시지가 세션 매니저로부터 들어오면, 상대 노드로 Init Message를 서로 보냄.
//     var target = call.request.dest_ip + ':' + call.request.dest_port
//     var session = new sessionSyncModule.SessionSync(target, grpc.credentials.createInsecure());
//     session.SessionInit(
//         {transID : 'a1',
//             PublishDatamap: 'publisheddatamapsample_FILE READ HERE'}, function(err, response){
//             console.log("SessionSetupRequest SENT to " + target)
//         }
//     )
// }
//
// function ChangeSession (call, callback) {
// }
//
// function SendHealthCheck (call, callback) {
//     console.log("RECEIVED SessionConfigRequest of " + call.request.transID)
//     console.log("HERE FOR SAVING " + call.request.publishDatamap)
//     callback(null ,{transID: call.request.transID,
//         result: 0})
//
// }
//
// function ReceiveHealthCheck (call, callback) {
//     console.log("RECEIVED SessionConfigRequest of " + call.request.transID)
//     console.log("HERE FOR SAVING " + call.request.publishDatamap)
//     callback(null ,{transID: call.request.transID,
//         result: 0})
// }
//
// function DisconnectSession (call, callback) {
//
// }
//
//
// /**
//  * Starts an RPC server that receives requests for the Greeter service at the
//  * sample server port
//  */
// function main() {
//     var server = new grpc.Server();
//     server.addService(hello_proto.Greeter.service, {
//             SessionSetupRequest: SessionSetupRequest,
//             SessionInit: SessionInit,
//             DatamapChangeEvent:DatamapChangeEvent
//         },
//         ReturnACK, ReturnACK);
//     server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
//         server.start();
//     });
// }
//
// main();

// [SM -> S-Worker]
parentPort.on('message', message => {
    switch (message.event) {
        // S-Worker 초기화 event
        case 'INIT':
            workerName = 'S-Worker[' + message.data.session_id + ']'
            port = message.data.port
            console.log('<--------------- [ ' + workerName + ' get message * INIT * ] --------------->')
            console.log(workerName + ' is now working on ' + port + '!!!')
            break;

        // 타 데이터 허브의 S-Worker end-point 전송 받음
        case 'GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT':
            console.log('<--------------- [ ' + workerName + ' get message * GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT * ] --------------->')
            console.log(workerName + ' is trying connection to ' + message.data.ip + ':' + message.data.port + '!!!')

            // todo: 타 데이터 허브의 S-Worker 와 연결하기
            break;
    }
})
