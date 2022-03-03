
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
    console.log('[SETTING] Session Created');
    this.my_end_point = {}
    this.my_end_point.ip = workerData.my_ip;
    this.my_end_point.port = workerData.my_portNum;
    this.session_id = workerData.my_session_id;
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
            console.log('[ ' + session.session_id + ' get message * INIT * ]')
            break;

        //
        case 'START_GRPC_SERVER':
            console.log('[ ' + session.session_id + ' get message * START_GRPC_SERVER * ]')
            server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
                console.log(workerName + '`s gRPC server is now working on ' + port + '!!!')
                server.start();
            });
            break;

        //
        case 'TRANSMIT_NEGOTIATION_RESULT':
            console.log('Session thread receive [TRANSMIT_NEGOTIATION_RESULT] event from SessionManager')
            console.log('[ ' + session.session_id + ' get message * TRANSMIT_NEGOTIATION_RESULT * ]')
            console.log(message.data)
            break;

    }
}

const session = new sess.Session();
