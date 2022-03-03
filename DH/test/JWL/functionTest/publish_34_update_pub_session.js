
const {Worker, parentPort, workerData} = require('worker_threads');
const sm = require(__dirname+'/publish_34_update_pub_session');
const crypto = require('crypto');
const detect = require('detect-port');

const workerName = 'SessionManager';

const MIN_PORT_NUM_OF_SESSION = 55000;
const MAX_PORT_NUM_OF_SESSION = 65535;

exports.SessionManager = function() {

    self = this;

    this.VC = workerData.vc_port;
    this.VC.on('message', this._vcListener);
    this.mutex_flag = workerData.mutex_flag;

    this.dm_ip = workerData.dm_ip;
    this.sl_addr = workerData.dm_ip + ':' + workerData.sl_portNum;
    this.sn_options = workerData.sn_options;
    this.pubvc_root = workerData.pubvc_root;
    this.subvc_root = workerData.subvc_root;
    this.session_list = {};
    this.session_list_to_daemon = [];
    this.first_commit_number = "INIT - first_commit_number";

    this.datahubInfo = {
        sodas_auth_key: crypto.randomBytes(20).toString('hex'),
        datahub_id: crypto.randomBytes(20).toString('hex')
    };

    console.log('[SETTING] SessionManager Created');

    this.session_list = [];
}

exports.SessionManager.prototype.run = function (){
    this._createSession().then(value => {
        this.session_list.push(value);
        this._sessionInit(value.worker);
    });

    console.log('[RUNNING] SessionManager is running');
}

exports.SessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        // ETRI's KAFKA 에서 Asset 데이터맵 변화 이벤트 감지 시, 해당 데이터맵 및 git Commit 정보를 전달받아서
        // sessionList 정보 조회 후, 해당 session 에게 UPDATE_PUB_ASSET 이벤트 전달
        case 'UPDATE_PUB_ASSET':
            console.log('[ ' + workerName + ' get message * UPDATE_PUB_ASSET * ]')
            console.log(message.data)            
            sessionManager._sessionUpdatePubAsset(sessionManager.session_list[0].worker, message.data)
            break;
    }
}

/* Session methods */
exports.SessionManager.prototype._sessionInit = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "INIT",
        data: null
    });
}

exports.SessionManager.prototype._sessionUpdatePubAsset = function (sessionWorker, update_pub_asset) {
    sessionWorker.postMessage({
        event: "UPDATE_PUB_ASSET",
        data: update_pub_asset
    });
}

/* sessionManager methods */
exports.SessionManager.prototype._createSession = async function () {
    var session = {};
    session.session_id = crypto.randomBytes(20).toString('hex');
    session.my_ip = this.dm_ip
    await this._setSessionPort().then(value => session.my_port = value);
    session.worker = await new Worker(__dirname+'/../../../SessionManager/DHSession/session.js', { workerData: {'my_session_id': session.session_id, 'my_ip': session.my_ip, 'my_portNum': session.my_port, 'pubvc_root': sessionManager.pubvc_root, 'subvc_root': sessionManager.subvc_root, 'mutex_flag': sessionManager.mutex_flag} });
    session.worker.on('message', this._sessionListener);
    return session
}

exports.SessionManager.prototype._sessionListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'RECONFIGURATION_NEGOTIATION_OPTIONS':
            break;
    }
}

exports.SessionManager.prototype._setSessionPort = async function () {
    await detect(MIN_PORT_NUM_OF_SESSION)
        .then(_port => {
        })
        .catch(err => {
            console.log(err);
        });
    return detect();
}

const sessionManager = new sm.SessionManager()
sessionManager.run();
