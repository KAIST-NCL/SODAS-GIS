
const PROTO_PATH = __dirname+'/../proto/sessionNegotiation.proto';
const {parentPort} = require('worker_threads');
const sr = require(__dirname+'/sessionRequester');
const policy = require(__dirname+'/../api/sync_policy');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const workerName = 'SessionRequester';

exports.SessionRequester = function () {

    parentPort.on('message', this._smListener);

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

}

let sessionNegotiationClient;
let sessionNegotiationOptions;

var test = {
    session_desc: {
        session_creator: 'session_requester',
        session_id: 'session_requester_id'
    },
    datamap_desc: {
        datamap_list: ['medical', 'finance', 'traffic'],
        data_catalog_vocab: 'DCATv2',
        datamap_sync_depth: 'Asset'
    },
    sync_desc: {
        sync_time_cycle: [2, 43],
        sync_count_cycle: [3, 5],
        is_active_sync: true,
        transfer_interface: ['gRPC']
    }
}
sessionNegotiationOptions = test;


// [SessionManager -> SessionRequester]
exports.SessionRequester.prototype._smListener = function (message) {
    switch (message.event) {
        // SessionRequester 초기화 event
        case 'INIT':
            console.log('<--------------- [ ' + workerName + ' get message * INIT * ] --------------->')
            console.log(workerName + ' is now working!!!')
            break;

        // 타 데이터 허브 SessionListener 의 endpoint 전달받아, gRPC 서버와 연동 및 세션 연동 절차를 시작하는 event
        case 'START_SESSION_CONNECTION':
            console.log('<--------------- [ ' + workerName + ' get message * START_SESSION_CONNECTION * ] --------------->')
            sessionNegotiationClient = this.gRPCInit(message.data)
            sessionNegotiationClient.RequestSessionNegotiation(sessionNegotiationOptions, (error, response) => {
                if (!error) {
                    console.log('Request Session Negotiation');
                    console.log(sessionNegotiationOptions);
                    console.log(response);
                    if (policy.check_negotiation_options(sessionNegotiationOptions, response)) {
                        console.log('Session Negotiation Completed!!');

                        // [SessionRequester -> SessionManager] [TRANSMIT_LISTENER_SESSION_WORKER_ENDPOINT]
                        parentPort.postMessage({ event: "TRANSMIT_LISTENER_SESSION_WORKER_ENDPOINT", data: { session_id: response.negotiation_info.session_desc.session_id, endpoint: response.end_point } });
                    }
                } else {
                    console.error(error);
                }
            });
            break;

        // 타 데이터 허브 SessionListener 와의 세션 협상이 체결된 후, 전송해야 하는 S-Worker 정보를 받는 event
        case 'GET_NEW_SESSION_WORKER_INFO':
            console.log('<--------------- [ ' + workerName + ' get message * GET_NEW_SESSION_WORKER_INFO * ] --------------->')
            console.log(message.data)
            sessionNegotiationOptions.session_desc.session_creator = message.data.session_creator;
            sessionNegotiationOptions.session_desc.session_id = message.data.session_id;
            break;

        // 데이터 허브 또는 사용자에 의해 협상 옵션이 바뀔 경우, 해당 정보를 보내는 event
        case 'UPDATE_NEGOTIATION_OPTIONS':
            console.log('<--------------- [ ' + workerName + ' get message * UPDATE_NEGOTIATION_OPTIONS * ] --------------->')
            sessionNegotiationOptions.datamap_desc = message.data.datamap_desc
            sessionNegotiationOptions.sync_desc = message.data.sync_desc
            console.log(sessionNegotiationOptions)
            break;
    }
}

/* SessionManager methods */
// [SessionRequester -> SessionManager] [TRANSMIT_LISTENER_SESSION_ENDPOINT]
exports.SessionRequester.prototype.SMTransmitListenerSessionEndpoint = function () {
    parentPort.postMessage({
        event: "TRANSMIT_LISTENER_SESSION_ENDPOINT",
        data: null
    });
}

exports.SessionRequester.prototype.gRPCInit = function (port) {
    return new this.SNproto(port, grpc.credentials.createInsecure());
}

exports.SessionRequester.prototype.gRPCClose = function () {
    grpc.closeClient(this.gRPCClient);
    console.log('gRPC session closed with other datahub SessionListener');
}

const sessionRequester = new sr.SessionRequester()
