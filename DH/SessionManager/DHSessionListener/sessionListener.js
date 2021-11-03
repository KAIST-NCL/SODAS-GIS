
const PROTO_PATH = __dirname+'/../proto/sessionNegotiation.proto';
const {parentPort, workerData} = require('worker_threads');
const sl = require(__dirname+'/sessionListener');
const policy = require(__dirname+'/../api/sync_policy');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const workerName = 'SessionListener';

exports.SessionListener = function () {

    parentPort.on('message', this._smListener);
    this.sl_ip = workerData.sl_ip
    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.SNproto = this.protoDescriptor.sessionNegotiation.SessionNegotiationBroker;
    this.sessionNegotiationOptions = {
        status: true,
        end_point: {
            ip: '0.0.0.0',
            port: 9091
        },
        negotiation_info: {
            session_desc: {
                session_creator: 'session_listener',
                session_id: 'session_listener_id'
            },
            datamap_desc: {
                sync_interest_list: ['rewrew', 'rewrew3'],
                data_catalog_vocab: 'DCATv2'
            },
            sync_desc: {
                sync_time: [33, 43],
                sync_count: [66, 200],
                transfer_interface: ['gRPC']
            }
        }
    }
}

// gRPC service function
exports.SessionListener.prototype._requestSN = function (call, callback) {
    console.log("[gRPC Call] RequestSessionNegotiation")
    var result = call.request
    console.log(result)
    sessionListener.sessionNegotiationOptions.negotiation_info.session_desc.session_creator = result.session_desc.session_creator
    sessionListener.sessionNegotiationOptions.negotiation_info.session_desc.session_id = result.session_desc.session_id
    console.log(sessionListener.sessionNegotiationOptions)
    if (policy.check_negotiation_options(sessionListener.sessionNegotiationOptions, result)) {
        parentPort.postMessage({event: "CREATE_NEW_SESSION_WORKER", data: result.session_desc.session_id})
        callback(null, sessionListener.sessionNegotiationOptions)
    }
}
exports.SessionListener.prototype._checkNegotiation = function (call, callback) {
    console.log("[gRPC Call] CheckNegotiation")
    var result = call.request
    console.log(result)
    if (result.status) {
        parentPort.postMessage('');
    }
}

exports.SessionListener.prototype._setListenerServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.SNproto.service, {
        RequestSessionNegotiation: this._requestSN,
        CheckNegotiation: this._checkNegotiation
    });
    return this.server;
}

exports.SessionListener.prototype.run = function () {
    this.sessionListenerServer = this._setListenerServer();
    this.sessionListenerServer.bindAsync(this.sl_ip,
        grpc.ServerCredentials.createInsecure(), () => {
            console.log('Session Listener gRPC Server running at ' + this.sl_ip)
            this.sessionListenerServer.start();
        });
}

/* Worker threads Listener */
exports.SessionListener.prototype._smListener = function (message) {
    switch (message.event) {
        // SessionListener 초기화 event, gRPC 서버 start
        case 'INIT':
            console.log('<--------------- [ ' + workerName + ' get message * INIT * ] --------------->')
            break;
        // 타 데이터 허브 SessionRequester 와의 세션 협상이 체결된 후, 전송해야 하는 S-Worker 정보를 받는 event
        case 'GET_NEW_SESSION_WORKER_INFO':
            console.log('<--------------- [ ' + workerName + ' get message * GET_NEW_SESSION_WORKER_INFO * ] --------------->')
            console.log(message.data)
            break;
        // 데이터 허브 또는 사용자에 의해 협상 옵션이 바뀔 경우, 해당 정보를 보내는 event
        case 'UPDATE_NEGOTIATION_OPTIONS':
            console.log('<--------------- [ ' + workerName + ' get message * UPDATE_NEGOTIATION_OPTIONS * ] --------------->')
            this.sessionNegotiationOptions.datamap_desc = message.data.datamap_desc
            this.sessionNegotiationOptions.sync_desc = message.data.sync_desc
            console.log(this.sessionNegotiationOptions)
            break;
    }
}

const sessionListener = new sl.SessionListener();


