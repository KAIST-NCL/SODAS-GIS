
const {parentPort} = require('worker_threads');
const policy = require('../api/sync_policy');

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync(
    './proto/sessionNegotiation.proto',{
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
});
const sessionNegotiationProto = grpc.loadPackageDefinition(packageDefinition);
const server = new grpc.Server()
let sessionNegotiationOptions;

const workerName = 'S-Listener';

var test = {
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
            datamap_list: ['rewrew', 'rewrew3'],
            data_catalog_vocab: 'DCATv2',
            datamap_sync_depth: 'Asset'
        },
        sync_desc: {
            sync_time_cycle: [33, 43],
            sync_count_cycle: [66, 200],
            is_active_sync: true,
            transfer_interface: ['gRPC']
        }
    }
}

server.addService(sessionNegotiationProto.sessionNegotiation.SessionNegotiationBroker.service, {
    RequestSessionNegotiation: (call, callback) => {
        console.log("[gRPC Call] RequestSessionNegotiation")
        var result = call.request
        console.log(result)
        test.negotiation_info.session_desc.session_creator = result.session_desc.session_creator
        test.negotiation_info.session_desc.session_id = result.session_desc.session_id
        console.log(test)
        if (policy.check_negotiation_options(test, result)) {
            parentPort.postMessage({event: "CREATE_NEW_SESSION_WORKER", data: result.session_desc.session_id})
            callback(null, test)
        }
    },
    CheckNegotiation: (call, callback) => {
        console.log("[gRPC Call] CheckNegotiation")
        var result = call.request
        console.log(result)
        if (result.status) {
            parentPort.postMessage('');
        }
    }
})

// [SM -> S-Listener]
parentPort.on('message', message => {
    switch (message.event) {
        // S-Listener 초기화 event, gRPC 서버 start
        case 'INIT':
            console.log('<--------------- [ ' + workerName + ' get message * INIT * ] --------------->')
            server.bindAsync(message.data, grpc.ServerCredentials.createInsecure(), () => {
                console.log('Session Listener gRPC Server running at ' + message.data)
                server.start();
            });
            break;

        // 타 데이터 허브 S-Requester 와의 세션 협상이 체결된 후, 전송해야 하는 S-Worker 정보를 받는 event
        case 'GET_NEW_SESSION_WORKER_INFO':
            console.log('<--------------- [ ' + workerName + ' get message * GET_NEW_SESSION_WORKER_INFO * ] --------------->')
            console.log(message.data)
            break;

        // 데이터 허브 또는 사용자에 의해 협상 옵션이 바뀔 경우, 해당 정보를 보내는 event
        case 'CHANGE_NEGOTIATION_OPTION':
            console.log('<--------------- [ ' + workerName + ' get message * CHANGE_NEGOTIATION_OPTION * ] --------------->')
            console.log(message.data)
            break;
    }
})
