
const {Worker, parentPort} = require('worker_threads');
const crypto = require('crypto');

const sm = require('./session_manager');

const workerName = 'SM';

exports.SessionManager = function() {
    this.datahubInfo = {
        sodasAuthKey: crypto.randomBytes(20).toString('hex'),
        datahubID: crypto.randomBytes(20).toString('hex')
    }
    this.sessionRequester = { key: null, worker: this.init_session_requester(), status: null }
    // this.sessionListener = { key: null, worker: this.init_session_listener(port), status: null }
    this.sessionWorker = {
        medical: [
            {
                session_desc : {
                    session_creator: null,
                    session_id: null
                },
                worker: null,
                status: null
            }
        ]
    }
    this.sessionNegotiationOptions = {
        datamap_desc: {
            datamap_list: ['medical', 'finance', 'traffic'],
            data_catalog_vocab: 'DCATv2',
            datamap_sync_depth: 'Asset'
        },
        sync_desc: {
            sync_time_cycle: [30, 60],
            sync_count_cycle: [5, 10],
            is_active_sync: true,
            transfer_interface: ['gRPC']
        }
    }
    this.tempSessionWorker = {
        requester: {
            session_id : null,
            port : null,
            worker: null,
            status: null
        },
        listener: {
            session_id : null,
            port : null,
            worker: null,
            status: null
        }
    }
}

//// ------- sessionRequesterWorker ------- ////
exports.SessionManager.prototype.init_session_requester = function () {
    const sessionRequesterWorker = new Worker('./thread/session_requester.js')

    // [SM -> S-Requester] [INIT]
    sessionRequesterWorker.postMessage({ event: "INIT", data: null });

    // todo: S-Worker -> SM 보내는 이벤트 세부 정의 필요!
    sessionRequesterWorker.on('message', message => {
        switch (message.event) {
            //
            case 'CLOSE':
                break;
        }
    })

    return sessionRequesterWorker
}

exports.SessionManager.prototype.update_negotiation_options = function () {
    // [SM -> S-Requester] [UPDATE_NEGOTIATION_OPTIONS]
    session_manager.sessionRequester.worker.postMessage({ event: "UPDATE_NEGOTIATION_OPTIONS", data: session_manager.sessionNegotiationOptions });
}


exports.SessionManager.prototype.start_session_connection = function (listenerEndPoint) {
    let session_id = crypto.randomBytes(20).toString('hex');
    this.create_requester_session_worker(session_id, 9090);

    // [SM -> S-Requester] [START_SESSION_CONNECTION]
    session_manager.sessionRequester.worker.postMessage({ event: "START_SESSION_CONNECTION", data: listenerEndPoint });
}


//// ------- sessionListenerWorker ------- ////
exports.SessionManager.prototype.init_session_listener = function (port) {
    const sessionListenerWorker = new Worker('./thread/session_listener.js')

    // [SM -> S-Listener] [INIT]
    sessionListenerWorker.postMessage({ event: "INIT", data: port });

    return sessionListenerWorker
}


//// ------- sessionWorker ------- ////
// todo: session worker 를 계속 생성할 때, end-point(port number) 부여 방법
exports.SessionManager.prototype.create_requester_session_worker = function (session_id, port) {
    const sessionWorker = new Worker('./thread/session.js');

    // [SM -> S-Worker] [INIT]
    sessionWorker.postMessage({ event: "INIT", data: { session_id: session_id, port: port } });

    session_manager.tempSessionWorker.requester.session_id = session_id;
    session_manager.tempSessionWorker.requester.port = port;
    session_manager.tempSessionWorker.requester.worker = sessionWorker;

    // [SM -> S-Requester] [GET_NEW_SESSION_WORKER_INFO]
    session_manager.sessionRequester.worker.postMessage({ event: "GET_NEW_SESSION_WORKER_INFO", data: { session_creator: session_manager.datahubInfo.datahubID, session_id: session_manager.tempSessionWorker.requester.session_id } });

    console.log(session_manager);
}


const session_manager = new sm.SessionManager()
console.log(session_manager)


// 탐색 모듈과 연동해서, 주기적으로 c-bucket 참조 -> 세션 연동 후보 노드 순차적으로 세션 연동 Request 보내는 로직

async function test() {

    let bootstrap_client = await session_manager.update_negotiation_options();
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let get = await session_manager.start_session_connection('127.0.0.1:50051')
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    return null;

}

test()

// [S-Requester -> SM]
session_manager.sessionRequester.worker.on('message', message => {
    switch (message.event) {
        // S-Requester 에서 세션 협상 완료된 Event 로, 타 데이터 허브의 S-Worker end-point 전송 받음
        case 'TRANSMIT_LISTENER_SESSION_WORKER_ENDPOINT':
            console.log('<--------------- [ ' + workerName + ' get message * TRANSMIT_LISTENER_SESSION_WORKER_ENDPOINT * ] --------------->')
            console.log(message.data)

            console.log(session_manager.tempSessionWorker.requester.session_id)
            console.log(message.data.session_id)
            // [SM -> S-Worker] [GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT]
            if (session_manager.tempSessionWorker.requester.session_id === message.data.session_id) {
                session_manager.tempSessionWorker.requester.worker.postMessage({ event: "GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT", data: message.data.endpoint })
            }
            break;
    }
})

// // [S-Listener -> SM]
// session_manager.sessionListener.worker.on('message', message => {
//     switch (message.event) {
//         //
//         case 'GET_NEW_SESSION_WORKER_INFO':
//             console.log(message.data)
//             break;
//     }
// })
