const {Worker, workerData} = require('worker_threads');
const sm = require(__dirname+'/session_test');
const detect = require('detect-port');

const MIN_PORT_NUM_OF_SESSION = 55000;

const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
const mutex_flag = new Int8Array(sharedArrayBuffer);

class test {
    // Todo.
    // 세션 생성에 필요한 내용 전달
    constructor(ip) {
        this.sessions = [];
        this.dm_ip = ip;
    }

    // 세션 생성 하는 함수
    Session_Create(id) {
        console.log("### Create Session: " + id);
        var index = this.sessions.length;
        this._createSession(id).then(()=> {
            this._sessionInit(this.sessions[index].worker);
            console.log(this.sessions);
        });
    }
    
    // 2. event = 'TRANSMIT_NEGOTIATION_RESULT' - > end_point.ip/port, session_desc, sn_options
    // session_desc: datahub_id, session_id
    Session_SetOptions(targetIndex, partnerIndex) {
        console.log("### Send Options to Session: " + targetIndex);
        var endpoint = {
            ip: this.sessions[partnerIndex].ip,
            port: this.sessions[partnerIndex].port
        };

        var session_desc = {
            session_id: this.sessions[partnerIndex].session_id
        };

        var sn_options = {
            datamap_desc: {
                sync_interest_list: ['domain01', 'taxonomy01', 'category001'],
                data_catalog_vocab: 'DCATv2'
            }, 
            sync_desc: {
                sync_time: [2, 43],
                sync_count: [3, 5],
                transfer_interface: ['gRPC']
            }
        };

        this._session_setoptions(targetIndex, endpoint, session_desc, sn_options);
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
        console.log("### Update Asset to Session: " + index);
        this.sessions[index].worker.postMessage({ event: 'UPDATE_PUB_ASSET', data: message});
    }

    async _createSession(id) {
        // workerData로 my_session_id, my_ip, my_portNum 건내주기
        var session = {};
        session.session_id = id;
        session.ip = this.dm_ip
        await this._setSessionPort().then(value => session.port = value);
        var subvc_root = __dirname + '/subvc';
        session.worker = await new Worker(__dirname + '/../../SessionManager/DHSession/session.js', 
                                         { workerData: {
                                             'my_session_id': session.session_id, 
                                             'my_ip': session.ip, 
                                             'my_portNum': session.port,
                                             'pubvc_root': __dirname + '/functionTest/pubvc',
                                             'subvc_root': subvc_root,
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