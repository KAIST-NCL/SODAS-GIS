
const fs = require('fs')
const {parentPort} = require('worker_threads');
let workerName;
let port;

const CHUNK_SIZE = 4*1024*1024 - 10
const PROTO_PATH = __dirname + '/../proto/sessionSync.proto';

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
const session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;
const server = new grpc.Server();

// todo: 타 데이터 허브의 데이터맵을 전송받아서 저장(git -> etri)하는 로직 정의 필요
server.addService(session_sync.SessionSync.service, {
    SessionInit: (call, callback) => {
        var subfileDir = './SubMaps'
        console.log("Server Side Received:" , call.request.transID)
        fs.writeFile(subfileDir + call.request.filedir , call.request.publishDatamap, 'binary', function(err){
            if (err) throw err
            console.log('write end') });
        callback(null, {transID: call.request.transID + 'OK', result: "Success"});
    }
})

function SessionInitStart( target ) {
    var client = new session_sync.SessionSync(target, grpc.credentials.createInsecure());
    let timestamp = new Date()
    let pubfileDir = './PubMaps'
    let filelist = []

    // fs.readdir(pubfileDir, function (err, files){
    //     console.log("PubMaps filelist: ", files, files.length)
    // })

    // for( let i = 0 ; i < filelist.length; i++){
    //     console.log("FLL:" , filelist[i])
    // }

    fs.readFile( pubfileDir + '/sample.pdf' , (err, data) => {
        if (err) throw err
        client.SessionInit({transID: timestamp + '/sample.pdf + "SEND',
                                 filedir: '/sampleRCV.pdf',
                                 publishDatamap: data},
            function (err, response) {
            console.log('Received Message:', response.transID, " // ", response.result);
        })
    })
}


/**
 * Starts an RPC server that receives requests for the Greeter service at the
 * sample server port
 */

// [SM -> S-Worker]
parentPort.on('message', message => {
    switch (message.event) {
        // S-Worker 초기화 event
        case 'INIT':
            workerName = 'S-Worker[' + message.data.session_id + ']'
            port = '0.0.0.0' + ':' + message.data.port
            console.log('<--------------- [ ' + workerName + ' get message * INIT * ] --------------->')
            break;

        //
        case 'START_GRPC_SERVER':
            console.log('<--------------- [ ' + workerName + ' get message * START_GRPC_SERVER * ] --------------->')
            server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
                console.log(workerName + '`s gRPC server is now working on ' + port + '!!!')
                server.start();
            });
            break;

        //
        case 'GET_SESSION_NEGOTIATION_OPTIONS':
            // todo: 세션 협상 옵션받아와서 내부 변수로 저장
            break;

        // 타 데이터 허브의 S-Worker end-point 전송 받음
        case 'GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT':
            // todo: 타 데이터 허브의 S-Worker 로 pubDatamap 전송
            console.log('<--------------- [ ' + workerName + ' get message * GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT * ] --------------->')
            console.log(workerName + ' is trying connection to ' + message.data.ip + ':' + message.data.port + '!!!')
            SessionInitStart(message.data.ip + ':' + message.data.port)
            break;

        // event handler messageChannel port 전송 받아서, 객체 저장
        case 'GET_EVENT_HANDLER_MESSAGECHANNEL_PORT':
            // eventHandler 객체
            break;
    }
})

// eventHandler.on('message', message => {
//     switch (message.event) {
//         //
//         case 'CHANGE_DATAMAP':
                // todo: sessionNegotiationOption 정보를 참조하여, sync_time or sync_cycle 에 맞춰 전송
                // 데이터맵 변화 이벤트 받은 뒤, git DB 참조하여 데이터맵 받아와서, 마지막 전송한 데이터맵 버전 비교한 뒤, 전송
                // 마지막으로 전송한 gRPC 메시지의 ack가 온 경우, 해당 데이터맵 버전은 로컬에 저장
//             break;
//
// })


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
