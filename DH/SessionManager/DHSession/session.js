
const PROTO_PATH = __dirname + '/../proto/sessionSync.proto';
const {parentPort, workerData} = require('worker_threads');
const sess = require(__dirname+'/session');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs')

let workerName = 'Session';
let port;

exports.Session = function () {

    parentPort.on('message', this.SMListener);

    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.sessSyncproto = this.protoDescriptor.SessionSync.SessionSyncBroker;
    console.log('[SETTING] SessionManager Created');
    console.log(workerData.my_session_id + ' / ' + workerData.my_portNum)
}

exports.Session.prototype.sessInit = function (call, callback) {
    var subfileDir = './SubMaps'
    console.log("Server Side Received:" , call.request.transID)
    fs.writeFile(subfileDir + call.request.filedir , call.request.publishDatamap, 'binary', function(err){
        if (err) throw err
        console.log('write end') });
    callback(null, {transID: call.request.transID + 'OK', result: "Success"});
}

exports.Session.prototype.setSessionServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.sessSyncproto.service, {
        SessionInit: this.sessInit
    });
    return this.server;
}

exports.Session.prototype.run = function (address) {
    this.sessionServer = this.setSessionServer();
    this.sessionServer.bindAsync(address,
        grpc.ServerCredentials.createInsecure(), () => {
            console.log('Session Listener gRPC Server running at ' + address)
            this.sessionServer.start();
        });
}

exports.Session.prototype.SessionInitStart = function ( target ) {
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

// [SessionManager -> Session]
exports.Session.prototype.SMListener = function (message) {
    switch (message.event) {
        // S-Worker 초기화 event
        case 'INIT':
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
}

const session = new sess.Session();
