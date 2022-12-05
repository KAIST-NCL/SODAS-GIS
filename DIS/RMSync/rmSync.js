const RMSESSION_PROTO_PATH = __dirname+'/proto/rmSession.proto';
const RMSESSIONSYNC_PROTO_PATH = __dirname+'/proto/rmSessionSync.proto';
const { parentPort, workerData } = require('worker_threads');
const { subscribeVC } = require('../VersionControl/versionController')
const rm = require(__dirname+'/rmSync');
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const fs = require("fs");
const execSync = require('child_process').execSync;
const crypto = require("crypto");
const diff_parser = require("../Lib/diff_parser");
const debug = require('debug')('sodas:rmSync\t\t|');


/**
 * RMSync
 * @constructor
 */
exports.RMSync = function () {

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.dhIp = workerData.disIp;
    this.rmPort = workerData.rmPort;
    this.rmSyncIp = this.dhIp + ':' + this.rmPort;
    this.gsRmSmIp = workerData.gsIp + ':' + workerData.gsPortNum;
    this.rmsyncRootDir = workerData.rmsyncRootDir;
    !fs.existsSync(this.rmsyncRootDir) && fs.mkdirSync(this.rmsyncRootDir);

    // Settings for GitDB
    this.VC = new subscribeVC(this.rmsyncRootDir+'/gitDB');
    this.VC.init();

    // gRPC Client to GS-RMSessionManager
    const rmSessionPackageDefinition = protoLoader.loadSync(
        RMSESSION_PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.rmSessionprotoDescriptor = grpc.loadPackageDefinition(rmSessionPackageDefinition);
    this.rmSessionproto = this.rmSessionprotoDescriptor.RMSession.RMSessionBroker;
    this.rmSessionClient = new this.rmSessionproto(this.gsRmSmIp, grpc.credentials.createInsecure());

    // gRPC Server from GS-RMSession
    const rmSessionSyncPackageDefinition = protoLoader.loadSync(
        RMSESSIONSYNC_PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.rmSessionSyncprotoDescriptor = grpc.loadPackageDefinition(rmSessionSyncPackageDefinition);
    this.rmSessionSyncproto = this.rmSessionSyncprotoDescriptor.RMSessionSyncModule.RMSessionSync;
    debug('[SETTING] RMSync Created')
};

/**
 * :ref:`dhDaemon` 으로부터 ``INIT`` 이벤트 수신 후, GIS 로부터의 오픈 참조 모델 동기화 수신을 위한
 * gRPC 기반 세션 서버 구동 및 GIS RMSessionManager 로 세션 연동을 요청하는 RMSync 주요 로직을 수행
 * @method
 * @see RMSync._setRMSyncServer
 * @see RMSync.requestRMSession
 */
exports.RMSync.prototype.run = function() {
    this.rmSyncServer = this._setRMSyncServer();
    this.rmSyncServer.bindAsync(this.rmSyncIp,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('[SETTING] RMSync gRPC Server running at ' + this.rmSyncIp)
            this.rmSyncServer.start();
        });
    this.requestRMSession();
};

/* Worker threads Listener */
/**
 * :ref:`dhDaemon` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너
 * @method
 * @private
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``INIT``
 * @see DHDaemon._rmSyncInit
 */
exports.RMSync.prototype._dhDaemonListener = function(message) {
    switch (message.event) {
        case 'INIT':
            debug('[RX: INIT] from DHDaemon');
            this.run();
            break;
        default:
            debug('[ERROR] DHDaemon Listener Error ! event:');
            debug(message.event);
            break;
    }
};

/* DHDaemon methods */
/**
 * GIS 로부터 오픈 참조 모델 동기화 전송을 받은 후, 업데이트된 오픈 참조 모델의 파일 경로와
 * KAFKA 이벤트 메시지 생성을 위한 업데이트된 오픈 참조 모델의 변경 operation(CREATE, UPDATE)를
 * :ref:`dhDaemon` 로 ``UPDATE_REFERENCE_MODEL`` 스레드 메시지를 전송함.
 * @method
 * @private
 * @param path_list - 업데이트된 오픈 참조 모델의 파일 경로
 * @param operation - 업데이트된 오픈 참조 모델의 변경 operation(CREATE, UPDATE)
 * @see DHDaemon._rmSyncListener
 * @see RMSync.Subscribe
 */
exports.RMSync.prototype._dmUpdateReferenceModel = function(path_list, operation) {
    debug('[TX: UPDATE_REFERENCE_MODEL] to DHDaemon');
    parentPort.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: {
            path: path_list,
            operation: operation
        }
    });
};

/**
 * GIS RMSessionManager 로 오픈 참조 모델 동기화를 위한 세션 연동을 요청하는 gRPC 통신을 전송하며,
 * 이때, DataHub 의 ID 와 기 구동한 gRPC 기반 세션 서버의 IP, Port 를 전송함.
 * @method
 * @see RMSync.run
 */
exports.RMSync.prototype.requestRMSession = function() {
    rmSync.rmSessionClient.RequestRMSession({'dhId': crypto.randomBytes(20).toString('hex'), dhIp: rmSync.dhIp, dhPort: rmSync.rmPort}, (error, response) => {
        if (!error) {
            debug('[LOG] Request RMSession Connection to GS-RMSessionManager');
            debug('[LOG] Get response from GS-RMSessionManager');
            debug(response);
        } else {
            debug('[ERROR]', error);
        }
    });
};

/* RMSync methods */
/**
 * GIS 로부터의 오픈 참조 모델 동기화 수신을 위한 gRPC 기반 세션 서버를 구동함.
 * 이후 GIS 에서 오픈 참조 모델이 업데이트될 경우, RMSync gRPC 기반 세션 서버의 Subscribe 함수를 호출하여,
 * 오픈 참조 모델의 변경점만 추출한 git patch 파일을 전달받아 VC 기반 오픈 참조 모델 동기화를 수행함.
 * @method
 * @private
 * @see RMSync.run
 * @see RMSync.Subscribe
 */
exports.RMSync.prototype._setRMSyncServer = function() {
    this.server = new grpc.Server();
    this.server.addService(this.rmSessionSyncproto.service, {
        SessionComm: (call, callback) => {
            self.Subscribe(self, call, callback);
        }
    });
    return this.server;
};

/**
 * 오픈 참조 모델의 변경점만 추출한 git patch 파일을 전달받아 VC 기반 오픈 참조 모델 동기화를 수행 및
 * :ref:`dhDaemon` 로 ``UPDATE_REFERENCE_MODEL`` 스레드 메시지를 전송하는 내부 함수 호출.
 * @method
 * @param self - RMSync 객체 (내부 변수 접근용)
 * @see RMSync._setRMSyncServer
 * @see RMSync.gitPatch
 * @see RMSync._dmUpdateReferenceModel
 */
exports.RMSync.prototype.Subscribe = function(self, call, callback) {
    debug('[LOG] Server: RMSync gRPC Received: to ' + call.request.receiverId);
    debug("[LOG] Git Patch Start");

    // git Patch 적용
    var result = self.gitPatch(call.request.gitPatch, self);
    callback(null, {transID: call.request.transID, result: result});

    var filepath_list = diff_parser.parse_git_patch(call.request.gitPatch);
    debug('[LOG] Operation: ' + call.request.operation);
    rmSync._dmUpdateReferenceModel(filepath_list, call.request.operation);
}

/**
 * 오픈 참조 모델의 변경점만 추출한 git patch 파일을 전달받아, VC 모듈의 git apply 함수를 통한
 * 로컬 gitDB 에 오픈 참조 모델 동기화(파일 저장)를 수행함.
 * @method
 * @param git_patch - 오픈 참조 모델의 변경점만 추출한 git patch 파일
 * @param self - RMSync 객체 (내부 변수 접근용)
 * @see RMSync.Subscribe
 */
exports.RMSync.prototype.gitPatch = function(git_patch, self) {
    var patch_name = Math.random().toString(10).slice(2,5) + '.patch';
    var temp = self.rmsyncRootDir + "/" + patch_name;
    try {
        fs.writeFileSync(temp, git_patch);
    } catch (err) {
        debug("[ERROR] ", err);
        return 1;
    }
    self.VC.apply("../" + patch_name);
    fs.existsSync(temp) && fs.unlink(temp, function (err) {
        if (err) {
            debug("[ERROR] ", err);
        }
    });
    return 0;
}

const rmSync = new rm.RMSync();
