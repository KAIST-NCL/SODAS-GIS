const {parentPort} = require('worker_threads');
let workerName;
let port;

const CHUNK_SIZE = 4*1024*1024 - 10
const PROTO_PATH = __dirname + '/../proto/SessionSyncModule.proto';

const fs = require('fs')
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
var session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;


function SessionInit(call, callback) {
    var subfileDir = '../SubMaps'
    console.log("Server Side Received:" , call.request.transID)
    fs.writeFile(subfileDir + call.request.filedir , call.request.publishDatamap, 'binary', function(err){
        if (err) throw err
        console.log('write end') });
    callback(null, {transID: call.request.transID + 'OK', result: "Success"});
}

async function SessionInitStart( target ) {
    var client = new session_sync.SessionSync(target, grpc.credentials.createInsecure());
    let timestamp = new Date()
    let pubfileDir = '../PubMaps'
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


/**
 * Starts an RPC server that receives requests for the Greeter service at the
 * sample server port
 */
function main() {
    var server = new grpc.Server();
    server.addService(session_sync.SessionSync.service, {
            SessionInit: SessionInit
        }
        );
    server.bindAsync('0.0.0.0:5005', grpc.ServerCredentials.createInsecure(), () => {
        server.start();
    });
    SessionInitStart('0.0.0.0:5005')
}

main();

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
