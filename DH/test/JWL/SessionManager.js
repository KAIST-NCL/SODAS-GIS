const {Worker, parentPort, workerData} = require('worker_threads');
const sm = require('./SessionManager');
const detect = require('detect-port');

const MIN_PORT_NUM_OF_SESSION = 55000;

exports.SessionManager = function() {
    console.log('==== SM Start')
    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    self.VC = workerData.vc_port;
    self.VC.on('message', function(message) {
        self._vcListener(message, self);
    });

    self.dm_ip = workerData.dm_ip;
    self.sn_options = workerData.sn_options;

    self.pubvc_root = workerData.pubvc_root;
    self.subvc_root = workerData.subvc_root;

    self.sessions = [];

    console.log('[SETTING] SessionManager Created');
}

exports.SessionManager.prototype.run = function (self){
    setTimeout(() => self.Session_Create(self, 0), 1000);
    setTimeout(() => self.Session_Create(self, 1), 1000);
    setTimeout(() => self.Session_SetOptions(self, 0, 1), 4000);
    setTimeout(() => self.Session_SetOptions(self, 1, 0), 4000);
    console.log('[RUNNING] SessionManager is running');
}

// 세션 생성 하는 함수
exports.SessionManager.prototype.Session_Create =function (self, id) {
    console.log("==== Create Session: " + id);
    self._createSession(self, id).then(()=> {
        self._sessionInit(self.sessions[id].worker);
    });
}

exports.SessionManager.prototype.Session_SetOptions = function(self, targetIndex, partnerIndex) {
    console.log("### Send Options to Session: " + targetIndex);
    var endpoint = {
        ip: self.sessions[partnerIndex].ip,
        port: self.sessions[partnerIndex].port
    };

    var session_desc = {
        session_id: self.sessions[partnerIndex].session_id
    };

    self._session_setoptions(targetIndex, endpoint, session_desc, self.sn_options);
}

exports.SessionManager.prototype._vcListener = function (message, self){
    switch (message.event) {
        // ETRI's KAFKA 에서 Asset 데이터맵 변화 이벤트 감지 시, 해당 데이터맵 및 git Commit 정보를 전달받아서
        // sessionList 정보 조회 후, 해당 session 에게 UPDATE_PUB_ASSET 이벤트 전달
        case 'UPDATE_PUB_ASSET':
            console.log('==== SM Received Message from VC');
            console.log(message.data);
            console.log('==== transmit this to Session 01');
            self.sessions[0].worker.postMessage(message);
            break;
    }
}

exports.SessionManager.prototype._createSession = async function(self, id) {
    // workerData로 my_session_id, my_ip, my_portNum 건내주기
    var session = {};
    session.session_id = id;
    session.ip = self.dm_ip
    await self._setSessionPort().then(value => session.port = value);
    session.worker = await new Worker('/home/ncl/jwlee/KAIST_SODAS/DH/SessionManager/DHSession/session.js', 
                                     { workerData: {
                                         'my_session_id': session.session_id, 
                                         'my_ip': session.ip, 
                                         'my_portNum': session.port,
                                         'subvc_root': this.subvc_root,
                                         'pubvc_root': this.pubvc_root
                                        } 
                                     });
    self.sessions.push(session);
}

exports.SessionManager.prototype._setSessionPort = async function() {
    await detect(MIN_PORT_NUM_OF_SESSION)
        .then(_port => {
        })
        .catch(err => {
            console.log(err);
        });
    return detect();
}

exports.SessionManager.prototype._sessionInit = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "INIT",
        data: null
    });
}

exports.SessionManager.prototype._session_setoptions = function(index, end_point, session_desc, sn_options) {
    this.sessions[index].worker.postMessage({
        event: 'TRANSMIT_NEGOTIATION_RESULT',
        end_point: end_point,
        session_desc: session_desc,
        sn_options: sn_options
    });
}

const sessionManager = new sm.SessionManager()
sessionManager.run(sessionManager);