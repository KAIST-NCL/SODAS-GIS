
const {Worker, parentPort, workerData} = require('worker_threads');
const sm = require(__dirname+'/sessionManager');
const crypto = require('crypto');
const detect = require('detect-port');

const workerName = 'SessionManager';

const MIN_PORT_NUM_OF_SESSION = 55000;
const MAX_PORT_NUM_OF_SESSION = 65535;
const debug = require('debug')('sodas:sessionManager');

exports.SessionManager = function() {

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.VC = workerData.vc_port;
    this.VC.on('message', this._vcListener);

    this.dm_ip = workerData.dm_ip;
    this.sl_addr = workerData.dm_ip + ':' + workerData.sl_portNum;
    this.sn_options = workerData.sn_options;
    this.pubvc_root = workerData.pubvc_root;
    this.subvc_root = workerData.subvc_root;
    this.mutex_flag = workerData.mutex_flag;
    this.session_list = {};
    this.session_list_to_daemon = [];

    this.datahubInfo = {
        sodas_auth_key: crypto.randomBytes(20).toString('hex'),
        datahub_id: crypto.randomBytes(20).toString('hex')
    };

    debug('[SETTING] SessionManager Created');
};
exports.SessionManager.prototype.run = function (){

    // setEnvironmentData
    const srParam = {'sn_options': this.sn_options, 'dh_id': this.datahubInfo.datahub_id}
    const slParam = {'sn_options': this.sn_options, 'dh_id': this.datahubInfo.datahub_id, 'sl_addr': this.sl_addr}

    // create SR, SL Thread
    this.sessionRequester = new Worker(__dirname+'/DHSessionRequester/sessionRequester.js', {workerData: srParam});
    this.sessionListener = new Worker(__dirname+'/DHSessionListener/sessionListener.js', {workerData: slParam});

    // setting on function
    this.sessionRequester.on('message', this._srListener);
    this.sessionListener.on('message', this._slListener);

    this._srInit();
    this._slInit();

    this._createSession().then(value => {
        this.slTempSession = value;
        this._sessionInit(this.slTempSession.worker);
        this._slGetNewSessionInfo();
    });

    debug('[RUNNING] SessionManager is running');
}

/* Worker threads Listener */
exports.SessionManager.prototype._dhDaemonListener = function (message){
    switch (message.event) {
        // 세션 협상 정보 업데이트
        case 'UPDATE_NEGOTIATION_OPTIONS':
            this.sn_options = message.data;
            this._srUpdateNegotiationOptions();
            this._slUpdateNegotiationOptions();
            break;
        // 동기화 시작 이벤트로, SessionRequester 에게 Bucket 정보와 함께 START_SESSION_CONNECTION 이벤트 전송
        case 'SYNC_ON':
            debug('[LOG] SessionManager thread receive [SYNC_ON] event from DHDaemon');
            debug('[LOG] SessionManager thread send [START_SESSION_CONNECTION] event from SessionRequester');
            this._srStartSessionConnection(message.data);
            this._createSession().then(value => {
                this.srTempSession = value;
                this._sessionInit(this.srTempSession.worker);
                this._srGetNewSessionInfo();
            });
            break;
    }
}
exports.SessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        // ETRI's KAFKA 에서 Asset 데이터맵 변화 이벤트 감지 시, 해당 데이터맵 및 git Commit 정보를 전달받아서
        // sessionList 정보 조회 후, 해당 session 에게 UPDATE_PUB_ASSET 이벤트 전달
        case 'UPDATE_PUB_ASSET':
            debug('[LOG] [' + workerName + ' get message * UPDATE_PUB_ASSET * ]');
            debug(message.data);
            let sync_list = message.data.filepath.split("/").slice(0,-1);
            let sync_target = null;
            for (let i = 0; i < sync_list.length; i++) {
                if (i == 0){
                    sync_target = sync_list[i]
                } else {
                    sync_target += "/" + sync_list[i]
                }
                debug(sync_target)
                if (sessionManager.session_list[sync_target]) {
                    for (let j = 0; j < sessionManager.session_list[sync_target].length; j++) {
                        sessionManager._sessionUpdatePubAsset(sessionManager.session_list[sync_target][j].worker, message.data)
                    }
                }
            }
            break;
    }
}
exports.SessionManager.prototype._srListener = function (message){
    switch (message.event) {
        // SessionRequester 에서 세션 협상 완료된 Event 로, 타 데이터 허브의 Session의 end-point 전송 받음
        case 'TRANSMIT_NEGOTIATION_RESULT':
            debug('[LOG] SessionManager thread receive [TRANSMIT_NEGOTIATION_RESULT] event from SessionRequester');
            debug('[LOG] [ ' + workerName + ' get message * TRANSMIT_NEGOTIATION_RESULT * ]')
            sessionManager.srTempSession.sn_result = message.data.sn_result;
            sessionManager.srTempSession.other_ip = message.data.end_point.ip;
            sessionManager.srTempSession.other_port = message.data.end_point.port;

            // todo: daemon 에 GET_SESSION_LIST_INFO
            let append_session = {};
            append_session.session_id = sessionManager.srTempSession.session_id;
            append_session.my_ip = sessionManager.srTempSession.my_ip;
            append_session.my_port = sessionManager.srTempSession.my_port;
            append_session.other_ip = sessionManager.srTempSession.other_ip;
            append_session.other_port = sessionManager.srTempSession.other_port;
            append_session.sn_result = sessionManager.srTempSession.sn_result;
            sessionManager.session_list_to_daemon.push(append_session);
            sessionManager._dmGetSessionListInfo();

            // todo: srTempSession, slTempSession 에 TRANSMIT_NEGOTIATION_RESULT 전송
            debug('[LOG] SessionManager thread send [TRANSMIT_NEGOTIATION_RESULT] event from Session(SR)')
            sessionManager._sessionTransmitNegotiationResult(sessionManager.srTempSession.worker, message.data.end_point, message.data.session_desc, message.data.sn_result);

            // todo: sessionList 관리
            if (message.data.sn_result.datamap_desc.sync_interest_list[0] in sessionManager.session_list) {
                sessionManager.session_list[message.data.sn_result.datamap_desc.sync_interest_list[0]].push(sessionManager.srTempSession)
            } else {
                sessionManager.session_list[message.data.sn_result.datamap_desc.sync_interest_list[0]] = [];
                sessionManager.session_list[message.data.sn_result.datamap_desc.sync_interest_list[0]].push(sessionManager.srTempSession)
            }

            // todo: srTempSession, slTempSession 초기화
            sessionManager.srTempSession = {};
            sessionManager._createSession().then(value => {
                sessionManager.srTempSession = value;
                sessionManager._sessionInit(sessionManager.srTempSession.worker);
                sessionManager._srGetNewSessionInfo();
                debug('[LOG] ', sessionManager.session_list)
            });

            break;
    }
}
exports.SessionManager.prototype._slListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'TRANSMIT_NEGOTIATION_RESULT':
            debug('[LOG]', 'SessionManager thread receive [TRANSMIT_NEGOTIATION_RESULT] event from SessionListener')
            debug('[LOG] [' + workerName + ' get message * TRANSMIT_NEGOTIATION_RESULT * ]');
            sessionManager.slTempSession.sn_result = message.data.sn_result;
            sessionManager.slTempSession.other_ip = message.data.end_point.ip;
            sessionManager.slTempSession.other_port = message.data.end_point.port;

            // todo: daemon 에 GET_SESSION_LIST_INFO
            let append_session = {};
            append_session.session_id = sessionManager.slTempSession.session_id;
            append_session.my_ip = sessionManager.slTempSession.my_ip;
            append_session.my_port = sessionManager.slTempSession.my_port;
            append_session.other_ip = sessionManager.slTempSession.other_ip;
            append_session.other_port = sessionManager.slTempSession.other_port;
            append_session.sn_result = sessionManager.slTempSession.sn_result;
            sessionManager.session_list_to_daemon.push(append_session);
            sessionManager._dmGetSessionListInfo();

            // todo: srTempSession, slTempSession 에 TRANSMIT_NEGOTIATION_RESULT 전송
            debug('[LOG] SessionManager thread send [TRANSMIT_NEGOTIATION_RESULT] event from Session(SL)')
            sessionManager._sessionTransmitNegotiationResult(sessionManager.slTempSession.worker, message.data.end_point, message.data.session_desc, message.data.sn_result);

            // todo: sessionList 관리
            if (message.data.sn_result.datamap_desc.sync_interest_list[0] in sessionManager.session_list) {
                sessionManager.session_list[message.data.sn_result.datamap_desc.sync_interest_list[0]].push(sessionManager.slTempSession)
            } else {
                sessionManager.session_list[message.data.sn_result.datamap_desc.sync_interest_list[0]] = [];
                sessionManager.session_list[message.data.sn_result.datamap_desc.sync_interest_list[0]].push(sessionManager.slTempSession)
            }

            // todo: srTempSession, slTempSession 초기화
            sessionManager.slTempSession = {};
            sessionManager._createSession().then(value => {
                sessionManager.slTempSession = value;
                sessionManager._sessionInit(sessionManager.slTempSession.worker);
                sessionManager._slGetNewSessionInfo();
                debug('[LOG] ',sessionManager.session_list)
            });


            break;
    }
}
exports.SessionManager.prototype._sessionListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'RECONFIGURATION_NEGOTIATION_OPTIONS':
            break;
    }
}

/* DHDaemon methods */
exports.SessionManager.prototype._dmGetSessionListInfo = function () {
    // [SessionManager -> DHDaemon] [GET_SESSION_LIST_INFO]
    debug('[LOG] SessionManager thread send [GET_SESSION_LIST_INFO] event to DHDaemon')
    debug('[LOG]', sessionManager.session_list);
    parentPort.postMessage({
        event: "GET_SESSION_LIST_INFO",
        data: sessionManager.session_list_to_daemon
    });
}

/* SessionRequester methods */
exports.SessionManager.prototype._srInit = function () {
    this.sessionRequester.postMessage({
        event: "INIT",
        data: null
    });
}
exports.SessionManager.prototype._srStartSessionConnection = function (bucketList) {
    this.sessionRequester.postMessage({
        event: "START_SESSION_CONNECTION",
        data: bucketList
    });
}
exports.SessionManager.prototype._srGetNewSessionInfo = function () {
    this.sessionRequester.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: {'sess_id': sessionManager.srTempSession.session_id, 'sess_ip': sessionManager.srTempSession.my_ip, 'sess_portNum': sessionManager.srTempSession.my_port}
    });
}
exports.SessionManager.prototype._srUpdateNegotiationOptions = function () {
    this.sessionRequester.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.sn_options
    });
}

/* SessionListener methods */
exports.SessionManager.prototype._slInit = function () {
    this.sessionListener.postMessage({
        event: "INIT",
        data: null
    });
}
exports.SessionManager.prototype._slGetNewSessionInfo = function () {
    this.sessionListener.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: {'sess_id': sessionManager.slTempSession.session_id, 'sess_ip': sessionManager.slTempSession.my_ip, 'sess_portNum': sessionManager.slTempSession.my_port}
    });
}
exports.SessionManager.prototype._slUpdateNegotiationOptions = function () {
    this.sessionListener.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.sn_options
    });
}

/* Session methods */
exports.SessionManager.prototype._sessionInit = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "INIT",
        data: {first_commit_number: sessionManager.first_commit_number}
    });
}
exports.SessionManager.prototype._sessionTransmitNegotiationResult = function (sessionWorker, end_point, session_desc, sn_options) {
    sessionWorker.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { end_point: end_point, session_desc: session_desc, sn_options: sn_options}
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
    session.worker = await new Worker(__dirname+'/DHSession/session.js', { workerData: {'my_session_id': session.session_id, 'my_ip': session.my_ip, 'my_portNum': session.my_port, 'pubvc_root': sessionManager.pubvc_root, 'subvc_root': sessionManager.subvc_root} });
    session.worker.on('message', this._sessionListener);

    return session
}
exports.SessionManager.prototype._setSessionPort = async function () {
    await detect(MIN_PORT_NUM_OF_SESSION)
        .then(_port => {
        })
        .catch(err => {
            debug('[ERROR]', err);
        });
    return detect();
}

const sessionManager = new sm.SessionManager()
sessionManager.run();
