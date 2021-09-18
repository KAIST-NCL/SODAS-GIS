
const {parentPort} = require('worker_threads');
const policy = require('../policy/sync_policy');

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync(
    './proto/session_negotiation.proto',{
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
});
let sessionNegotiationClient;
let sessionNegotiationOptions;

const workerName = 'S-Requester';

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

// [SM -> S-Request]
parentPort.on('message', message => {
    switch (message.event) {
        // S-Request 초기화 event
        case 'INIT':
            console.log('<--------------- [ ' + workerName + ' get message * INIT * ] --------------->')
            console.log(workerName + ' is now working!!!')
            break;

        // 타 데이터 허브 S-Listener 의 endpoint 전달받아, gRPC 서버와 연동 및 세션 연동 절차를 시작하는 event
        case 'START_SESSION_CONNECTION':
            console.log('<--------------- [ ' + workerName + ' get message * START_SESSION_CONNECTION * ] --------------->')
            sessionNegotiationClient = grpc_init(message.data)
            sessionNegotiationClient.RequestSessionNegotiation(test, (error, response) => {
                if (!error) {
                    console.log('Request Session Negotiation');
                    console.log(test);
                    console.log(response);
                    if (policy.check_negotiation_options(test, response)) {
                        console.log('Session Negotiation Completed!!');

                        // [S-Requester -> SM] [TRANSMIT_LISTENER_SESSION_WORKER_ENDPOINT]
                        parentPort.postMessage({ event: "TRANSMIT_LISTENER_SESSION_WORKER_ENDPOINT", data: { session_id: response.negotiation_info.session_desc.session_id, endpoint: response.end_point } });
                    }
                } else {
                    console.error(error);
                }
            });
            break;

        // 타 데이터 허브 S-Listener 와의 세션 협상이 체결된 후, 전송해야 하는 S-Worker 정보를 받는 event
        case 'GET_NEW_SESSION_WORKER_INFO':
            console.log('<--------------- [ ' + workerName + ' get message * GET_NEW_SESSION_WORKER_INFO * ] --------------->')
            console.log(message.data)
            test.session_desc.session_creator = message.data.session_creator;
            test.session_desc.session_id = message.data.session_id;
            break;

        // 데이터 허브 또는 사용자에 의해 협상 옵션이 바뀔 경우, 해당 정보를 보내는 event
        case 'UPDATE_NEGOTIATION_OPTIONS':
            console.log('<--------------- [ ' + workerName + ' get message * UPDATE_NEGOTIATION_OPTIONS * ] --------------->')
            sessionNegotiationOptions = message.data
            console.log(sessionNegotiationOptions)
            break;
    }
})

function grpc_init(port) {
    const sessionNegotiationProto = grpc.loadPackageDefinition(packageDefinition).session_negotiation.SessionNegotiationBroker;
    return new sessionNegotiationProto(port, grpc.credentials.createInsecure());
}

function grpc_close(grpc_client) {
    grpc.closeClient(grpc_client);
    console.log('gRPC session closed with other datahub S-Listener');
}
