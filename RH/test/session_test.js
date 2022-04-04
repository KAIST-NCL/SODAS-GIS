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
        this.dm_ip = ip;
        this.dh_listener=[];
    }

    // 세션 생성 하는 함수
    RMSession_Create(id) {
        console.log("### Create RMSession for DH: " + id);
        this._createSession(id).then((worker)=> {
            worker.postMessage({
                event: "INIT",
                data: null
            });
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
        //console.log(dh);
        console.log("Create DH Listener Session: " + id);
        this.dh_listener.push(dh);
        this.RMSession_Create(id);
    }

    Session_Update_Asset(message) {
        console.log("### Update Reference Mmodel to Session");
        this.worker_session.postMessage({ event: 'UPDATE_REFERENCE_MODEL', data: message});
    }

    async _createSession(dh_id) {
        var worker = new Worker(__dirname + '/../RMSync/RMSession/rmSession.js', 
                                         { workerData: {
                                             'session_id': 0,
                                             'dh_id': dh_id, 
                                             'dh_ip': this.dh_listener[dh_id].ip, 
                                             'dh_port': this.dh_listener[dh_id].port,
                                             'pubvc_root': __dirname + '/functionTest/reference_files_dir',
                                             'mutex_flag': mutex_flag} 
                                         });
        this.worker_session=worker;
        return worker
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
}


exports.test = test;