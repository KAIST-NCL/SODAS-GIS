const fs = require('fs');
const {publishVC} = require('../VersionControl/versionController')
const PROTO_PATH = __dirname+'/proto/rmSession.proto';
const { Worker, workerData, parentPort } = require('worker_threads');
const rmSM = require(__dirname+'/rmSessionManager');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const crypto = require("crypto");
const execSync = require('child_process').execSync;
const debug = require('debug')('sodas:rmSessionManager');

/**
 * RMSessionManager
 * @constructor
 */
exports.RMSessionManager = function () {

    self = this;

    this.VC = workerData.vcPort;

    this.rmSmAddr = workerData.smIp + ':' + workerData.smPortNum;
    this.pubvcRoot = workerData.pubvcRoot;
    this.mutexFlag = workerData.mutexFlag;

    this.pVC= new publishVC(this.pubvcRoot);
    this.msgStorepath = this.pubvcRoot+'/../msgStore.json'
    const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
    this.errorSession = new Int8Array(sharedArrayBuffer);
    this.errorSession[0] = 0;

    this.delayedCommitNumbers = "";
    this.poolTimer = null;

    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.rmSessionproto = this.protoDescriptor.RMSession.RMSessionBroker;
    this.rmSessionDict = {};
    this.rmSessionListToDaemon = [];
    debug('RMSessionManager thread is running');

    var self = this;
    parentPort.on('message', (message)=> {
        self._gsDaemonListener(message);
    })
};

/**
 * :ref:`gsDaemon` 에 의해 RMSessionManager 모듈이 생성된 이후 바로 실행되는 함수로,
 * SODAS+ DIS RMSync 로부터의 오픈 참조 모델 동기화를 위한 세션 연동 요청을 처리하는 gRPC 서버를 구동함.
 * @method
 */
exports.RMSessionManager.prototype.run = function () {
    rmSessionManager.rmSMServer = rmSessionManager._setRMSessionManager();
    rmSessionManager.rmSMServer.bindAsync('0.0.0.0:' + workerData.smPortNum,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('gRPC Server running at ' + rmSessionManager.rmSmAddr);
            rmSessionManager.rmSMServer.start();
        });
}

/**
 * :ref:`gsDaemon` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param {dictionary(event,data)} message - 스레드 메시지
 * @param {string} message:event - ``INIT``
 * @see GSDaemon._rmSMInit
 */
exports.RMSessionManager.prototype._gsDaemonListener = function(message) {
    switch (message.event) {
        case 'INIT':
            this.init();
            break;
        default:
            debug("Wrong Type of Event From Daemon");
            break;
    }
}

/**
 * :ref:`versionControl` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param {dictionary(event,data)} message - 스레드 메시지
 * @param {string} message:event - ``UPDATE_REFERENCE_MODEL``
 * @see vcModule.reportCommit
 */
exports.RMSessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        case 'UPDATE_REFERENCE_MODEL':
            debug('[RX: UPDATE_REFERENCE_MODEL] from VersionControl');
            debug(message.data);

            // 에러가 난 세션이 있을 경우엔 Queue에 추가한다
            if (rmSessionManager.errorSession[0] > 0) {
                // 주기적으로 에러 세션 전부 고쳐졌나 점검하는 함수
                if(rmSessionManager.delayedCommitNumbers != "") rmSessionManager.delayed_updateHandler();

                // 마지막 Commit만 기억한다.
                rmSessionManager.delayedCommitNumbers = message.data.commitNumber;
            }
            else {
                if(rmSessionManager.pool_timer != null) {
                    clearTimeout(rmSessionManager.poolTimer);
                    rmSessionManager.poolTimer = null;
                    rmSessionManager.delayedCommitNumbers = "";
                }
                rmSessionManager.updateHandler(message.data.commitNumber);
            }
            break;
    }
}

/**
 * :ref:`versionControl` 에서 ``UPDATE_REFERENCE_MODEL`` 이벤트 스레드 메시지를 받은 뒤,
 * SODAS+ DIS RMSync 모듈과 연동된 :ref:`rmSession` 으로
 * referenceModel/dictionary pubvc gitDB 에 commit 및 diff 추출을 통해 생성한 gitPatch file 을 ``UPDATE_REFERENCE_MODEL`` 이벤트 스레드 메시지로 전달함.
 * @method
 * @private
 * @param {worker} rmSessionWorker - SODAS+ DIS RMSync 모듈의 오픈 참조 모델 동기화 정보를 전송받는 gRPC 서버와 연동되어 있는 rmSession worker 객체
 * @param {dictionary(patch,commitNumbers)} gitPatch - 업데이트된 오픈 참조 모델의 gitPatch file 과 관련 commit 번호
 * @see RMSession._smListener
 */
exports.RMSessionManager.prototype._rmSessionUpdateReferenceModel = function (rmSessionWorker, gitPatch) {
    rmSessionWorker.postMessage({
        event: "UPDATE_REFERENCE_MODEL",
        data: {
            patch: gitPatch.patch,
            commitNumbers: gitPatch.commitNumbers,
            operation: "UPDATE"
        }
    });
}

/**
 * SODAS+ DIS RMSync 모듈에서 오픈 참조 모델 동기화를 위한 세션 연동 요청을 처리하는 함수로,
 * 신규 :ref:`rmSession` 생성하고, DIS RMSync 모듈의 gRPC 서버 end point 정보를 전달함.
 * @method
 * @private
 * @param call - gRPC client 가 전송한 메시지
 * @param callback - callback 함수
 */
exports.RMSessionManager.prototype._requestRMSession = function (call, callback) {
    debug("[GS] [RMSessionManager] - RequestRMSession");
    var dhNode = call.request
    debug("Request RMSession Connection from DH-RMSync");
    debug(dhNode);
    rmSessionManager._createNewRMSession(dhNode);
    callback(null, {result: 'OK', rmSessionId: rmSessionManager.rmSessionListToDaemon[0].sessionId})
};

/**
 * SODAS+ DIS RMSync 로부터의 오픈 참조 모델 동기화를 위한 세션 연동 요청을 처리하는 gRPC 서버를 구동하는 함수로,
 * 해당 기능을 처리하는 내부함수를 gRPC 서비스로 연동함.
 * @method
 * @private
 * @see RMSessionManager._requestRMSession
 */
exports.RMSessionManager.prototype._setRMSessionManager = function () {
    rmSessionManager.server = new grpc.Server();
    rmSessionManager.server.addService(rmSessionManager.rmSessionproto.service, {
        RequestRMSession: rmSessionManager._requestRMSession
    });
    return rmSessionManager.server;
}

/**
 * :ref:`rmSession` 모듈을 worker thread 로 실행하고, 생성된 신규 rmSession 모듈에서 기존 관리되고 있는 오픈 참조 모델을 처음으로 동기화하도록 하는
 * ``RMSessionManager.sessionInitPatch`` 함수를 호출함.
 * @method
 * @private
 * @param {dictionary(sessionId,dhId,dhIp,dhPort)} dhNode - 오픈 참조 모델 동기화를 위한 세션 연동 요청을 전송한 SODAS+ DIS 의 end point 정보
 * @see RMSession._smListener
 */
exports.RMSessionManager.prototype._createNewRMSession = function (dhNode) {
    dhNode['sessionId'] = crypto.randomBytes(20).toString('hex')
    var rmSessParam = {
        sessionId: dhNode.sessionId,
        dhId: dhNode.dhId,
        dhIp: dhNode.dhIp,
        dhPort: dhNode.dhPort,
        pubvcRoot: rmSessionManager.pubvcRoot,
        mutexFlag: rmSessionManager.mutexFlag,
        errorFlag: rmSessionManager.errorSession
    };
    debug('Create New RMSession');
    debug(rmSessParam);
    var rmSession = new Worker(__dirname+'/RMSession/rmSession.js', {workerData: rmSessParam});
    rmSessionManager.rmSessionListToDaemon.push(dhNode);
    rmSessionManager.rmSessionDict[dhNode.sessionId] = rmSession;

    rmSessionManager.sessionInitPatch().then((git_patch) => {
        debug("git Patch")
        debug(git_patch.commitNumbers);
        rmSession.postMessage({
            event: "INIT",
            data: {
                patch: git_patch.patch,
                commitNumbers: git_patch.commitNumbers,
                operation: "CREATE"
            }
        });
    });
};

/**
 * @method
 */
exports.RMSessionManager.prototype.init = function() {
    debug('RMSessionManager Initializing...');
    // kafka On
    this.VC.on('message', this._vcListener);

    // git Init
    var first_commit = rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvcRoot);
    if(!fs.existsSync(rmSessionManager.msgStorepath)) rmSessionManager._save_last_commit(rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvcRoot));
    var content = rmSessionManager.__readDict();
    debug("First Commit: " + first_commit);
    debug("Previous LC: " + content.previousLastCommit);
    if (first_commit == content.previousLastCommit) {
        // first add all the things in the folder and commit them
        // 처음에 시드 없이 시작할 때를 대비해서 init.txt에 아무 값이나 집어넣기
        fs.writeFileSync(rmSessionManager.pVC.vcRoot + '/' + "init.txt", "initialized", 'utf8');
        execSync('cd ' + rmSessionManager.pVC.vcRoot + " && git add ./");
        var stdout = execSync('cd ' + rmSessionManager.pVC.vcRoot + ' && git commit -m "asdf" && git rev-parse HEAD');
        var printed = stdout.toString().split('\n');
        printed.pop();
        var comm = printed.pop();
        content.stored = content.stored+1;
        content.commitNumber.push(comm);
        rmSessionManager._save_last_commit(comm);
    }
}

/**
 * 신규 연동된 SODAS+ DIS 에게 최초로 전달할 gitPatch file 을 생성하는 함수로,
 * gitDB 의 최초 commit 부터 마지막 commit 사이의 Patch 를 추출한다
 * @method
 * @return initGitPatch - 최초 commit 부터 마지막 commit 사이의 Patch file
 */
exports.RMSessionManager.prototype.sessionInitPatch = async function() {
    debug("Session Init Patch");
    var firstCommit= rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvcRoot);
    if(!fs.existsSync(rmSessionManager.msgStorepath)) rmSessionManager._save_last_commit(rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvcRoot));
    var content = rmSessionManager.__readDict();
    debug("First Commit: " + firstCommit);
    debug("Previous LC: " + content.previousLastCommit);
    if (firstCommit == content.previousLastCommit) {
        debug(" Not Initialized before ");
    }
    else {
        var initGitPatch = await rmSessionManager.extractInitPatch(content.previousLastCommit, firstCommit);
        return initGitPatch;
    }
}

/**
 * 인자로 받은 최초 commit 부터 마지막 commit 사이의 gitPatch file 을 추출한 뒤, 반환하는 함수.
 * @method
 * @param {string} lastCommit - git Patch 추출 대상이 되는 마지막 commit 번호
 * @param {string} firstCommit - git Patch 추출 대상이 되는 첫번째 commit 번호
 * @returns toReturn - dictionary(patch, commitNumbers) 구조의 gitPatch file 과 관련 commit 번호
 */
exports.RMSessionManager.prototype.extractInitPatch= async function(lastCommit, firstCommit){
    // patch from the first commit. Ref: https://stackoverflow.com/a/40884093
    var patch = execSync('cd ' + rmSessionManager.pubvcRoot + ' && git diff --no-color ' + firstCommit + ' '+ lastCommit);
    var toReturn = {
        patch: patch.toString(),
        commitNumbers: [firstCommit, lastCommit]
    };
    return toReturn;
}

/**
 * 오픈 참조 모델 동기화 세션이 연동되어 있는 SODAS+ DIS RMSync 모듈에게 전달할 gitPatch file 을 추출하는 함수
 * @method
 * @param {dictionary(stored,commitNumber,previousLastCommit)} toPublish - DIS 에게 전달할 git Diff 를 추출하는데 필요한 내용
 * @returns toReturn - dictionary(patch, commitNumbers) 구조의 gitPatch file 과 관련 commit 번호
 */
exports.RMSessionManager.prototype.extractGitDiff = async function(toPublish) {
    if (rmSessionManager.mutexFlag[0] == 1) {
        const timeOut = 100;
        setTimeout(rmSessionManager.extractGitDiff.bind(rmSessionManager), timeOut, toPublish);
    }
    else {
        rmSessionManager.mutexFlag[0] = 1;
        var gitDiff = execSync('cd ' + rmSessionManager.pubvcRoot + ' && git diff --no-color ' + toPublish.previousLastCommit + ' ' + toPublish.commitNumber[toPublish.stored - 1]);
        rmSessionManager.mutexFlag[0] = 0;
        debug(gitDiff);
        var toReturn = {
            patch: gitDiff.toString(),
            commitNumbers: [toPublish.previousLastCommit, toPublish.commitNumber[toPublish.stored - 1]]
        }
        return toReturn;
    }
}

/**
 * :ref:`versionControl` 에서 ``UPDATE_REFERENCE_MODEL`` 이벤트 스레드 메시지를 받은 뒤,
 * 새로운 referenceModel/dictionary file 정보가 pubvc gitDB 에 업데이트 될 경우,
 * 해당 내용을 기록/관리하고 연동된 DIS 에게 전달하는 함수
 * @method
 * @param {string} commitNumber - 업데이트 된 referenceModel/dictionary file 과 관련된 commit 번호
 */
exports.RMSessionManager.prototype.updateHandler = function(commitNumber) {
    // GIT PATCH EXTRACTION
    var content = rmSessionManager.__readDict();
    content.stored = content.stored + 1;
    content.commitNumber.push(commitNumber);
    rmSessionManager.__saveDict(content);

    const toPublish = rmSessionManager.__readDict();
    rmSessionManager._save_last_commit(toPublish.commitNumber[toPublish.commitNumber.length - 1]);
    rmSessionManager.extractGitDiff(toPublish).then((gitPatch) => {
        // GIT PATCH BROADCAST
        for (var key in rmSessionManager.rmSessionDict) {
            rmSessionManager._rmSessionUpdateReferenceModel(rmSessionManager.rmSessionDict[key], gitPatch)
        }
    });
}

/**
 * 만약 DIS 와 연동된 session 이 오작동하여 업데이트 내용이 전달되지 않은 경우 해당 오류가 고쳐진 뒤 다시 업데이트 내용을 전송하는 함수
 * @method
 */
exports.RMSessionManager.prototype.delayed_updateHandler = function() {
    if (rmSessionManager.errorSession[0] > 0) {
        rmSessionManager.poolTimer = setTimeout(rmSessionManager.delayed_updateHandler, 100);
    }
    else {
        rmSessionManager.poolTimer = null;
        rmSessionManager.updateHandler(rmSessionManager.delayedCommitNumbers);
        rmSessionManager.delayedCommitNumbers = "";
    }
}

/**
 * rmSessionManager의 내부 변수를 JSON으로 저장하는 함수
 * @method
 * @private
 */
exports.RMSessionManager.prototype.__saveDict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(rmSessionManager.msgStorepath, contentJSON);
}

/**
 * JSON으로 저장된 rmSessionManager의 내부 변수를 불러오는 함수
 * @method
 * @private
 */
exports.RMSessionManager.prototype.__readDict = function() {
    return JSON.parse(fs.readFileSync(rmSessionManager.msgStorepath).toString());
}

/**
 * DIS에 Publish한 후 마지막 Publish 대상인 commit 번호를 저장하는 함수
 * @method
 * @private
 * @param {string} lastCommit - pubvc gitDB 에 마지막으로 commit 된 commit 번호
 */
exports.RMSessionManager.prototype._save_last_commit = function(lastCommit) {
    var lc = (typeof lastCommit  === 'undefined') ? "" : lastCommit;
    const content = {
        stored: 0,
        commitNumber: [],
        previousLastCommit: lc
    }
    rmSessionManager.__saveDict(content);
}

const rmSessionManager = new rmSM.RMSessionManager();
rmSessionManager.run();
