const {Worker, workerData} = require('worker_threads');
const sm = require(__dirname+'/session_test');
const detect = require('detect-port');

const MIN_PORT_NUM_OF_SESSION = 55000;

const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
const mutex_flag = new Int8Array(sharedArrayBuffer);

const PROTO_PATH = __dirname + '/../RMSync/proto/rmSessionSync.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const execSync = require('child_process').execSync;
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })
const session_sync = grpc.loadPackageDefinition(packageDefinition).RMSessionSyncModule;

class test {
    // Todo.
    // 세션 생성에 필요한 내용 전달
    constructor(ip) {
        this.sessions = [];
        this.dm_ip = ip;
        this.dh_listener=[];
    }

    // 세션 생성 하는 함수
    RMSession_Create(id) {
        console.log("### Create RMSession: " + id);
        var index = this.sessions.length;
        this._createSession(id).then(()=> {
            this._sessionInit(this.sessions[index].worker);
            console.log(this.sessions);
        });
    }
    async DHListener_Create(id) {
        var dh={};
        dh.id = id;
        dh.ip=this.dm_ip;
        await this._setSessionPort().then(value => dh.port = value);
        dh.addr = this.dm_ip+':'+dh.port;
        dh.server = new grpc.Server();
        dh.server.addService(session_sync.RMSessionSync.service, {
            // (1): Subscription from counter session
            SessionComm: (call, callback) => {
                console.log("DH received:", call.request);
                callback(null, {transID: call.request.transID, result: 0});
            }
        });
        dh.server.bindAsync(dh.addr, grpc.ServerCredentials.createInsecure(), ()=> {
            dh.server.start();
        });
        console.log(dh);
        this.dh_listener.push(dh);
    }
    // 2. event = 'TRANSMIT_NEGOTIATION_RESULT' - > end_point.ip/port, session_desc, sn_options
    // session_desc: datahub_id, session_id
    Session_SetOptions(RHIndex, DHIndex) {
        console.log("### Send Options to Session: " + RHIndex);
        var endpoint = {
            ip: this.dh_listener[DHIndex].ip,
            port: this.dh_listener[DHIndex].port
        };

        var session_desc = {
            dh_id: this.dh_listener[DHIndex].id
        };

        var sn_options = {
            datamap_desc: {
                data_catalog_vocab: 'DCATv2'
            }, 
            sync_desc: {
                sync_time: [2, 43],
                sync_count: [2, 5],
                transfer_interface: ['gRPC']
            }
        };

        this._session_setoptions(RHIndex, endpoint, session_desc, sn_options);
    }

    _session_setoptions(index, end_point, session_desc, sn_options) {
        this.sessions[index].worker.postMessage({
            event: 'TRANSMIT_NEGOTIATION_RESULT',
            data: {end_point: end_point,
            session_desc: session_desc,
            sn_options: sn_options}
        });
    }

    // 3. event = 'UPDATE_PUB_ASSET' - > asset_id, commit_number, related, filepath
    Session_Update_Asset(index, message) {
        console.log("### Update Reference Mmodel to Session: " + index);
        this.sessions[index].worker.postMessage({ event: 'UPDATE_REFERENCE_MODEL', data: message});
    }

    async _createSession(id) {
        var session = {};
        session.session_id = id;
        session.ip = this.dm_ip;
        await this._setSessionPort().then(value => session.port = value);
        session.worker = await new Worker(__dirname + '/../RMSync/RMSession/rmSession.js', 
                                         { workerData: {
                                             'session_id': session.session_id, 
                                             'dh_ip': session.ip, 
                                             'dh_port': session.port,
                                             'pubvc_root': __dirname + '/functionTest/reference_files_dir',
                                             'mutex_flag': mutex_flag} 
                                         });
        this.sessions.push(session);
    }

    async _setSessionPort() {
        await detect(MIN_PORT_NUM_OF_SESSION)
            .then(_port => {
            })
            .catch(err => {
                console.log(err);
            });
        return detect();
    }

    _sessionInit(sessionWorker) {
        sessionWorker.postMessage({
            event: "INIT",
            data: null
        });
    }
}


exports.test = test;