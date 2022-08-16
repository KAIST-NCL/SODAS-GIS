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

exports.RMSessionManager = function () {

    self = this;

    this.VC = workerData.vcPort;
    this.VC.on('message', this._vcListener);

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
    debug('RMSessionManager thread is running')
};

/* Worker threads Listener */
exports.RMSessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        case 'UPDATE_REFERENCE_MODEL':
            debug('[RX: UPDATE_REFERENCE_MODEL] from VersionControl');
            debug(message.data);

            // 에러가 난 세션이 있을 경우엔 Queue에 추가한다
            if (this.errorSession[0] > 0) {
                // 주기적으로 에러 세션 전부 고쳐졌나 점검하는 함수
                if(this.delayedCommitNumbers == "") this.delayed_updateHandler();

                // 마지막 Commit만 기억한다.
                this.delayedCommitNumbers = message.data.commitNumber;
            }
            else {
                if(this.pool_timer != null) {
                    clearTimeout(this.poolTimer);
                    this.poolTimer = null;
                    this.delayedCommitNumbers = "";
                }
                this.updateHandler(message.data.commitNumber);
            }
            break;
    }
}

exports.RMSessionManager.prototype._rmSessionUpdateReferenceModel = function (rmSessionWorker, git_patch) {
    rmSessionWorker.postMessage({
        event: "UPDATE_REFERENCE_MODEL",
        data: { 
            patch: git_patch,
            commitNumbers: git_patch.commitNumbers
        }
    });
}

exports.RMSessionManager.prototype._requestRMSession = function (call, callback) {
    debug("[RH] [RMSessionManager] - RequestRMSession");
    var dhNode = call.request
    debug("Request RMSession Connection from DH-RMSync");
    debug(dhNode);
    rmSessionManager._createNewRMSession(dhNode);
    callback(null, {result: 'OK', rmSessionId: rmSessionManager.rmSessionListToDaemon[0].sessionId})
};

exports.RMSessionManager.prototype._setRMSessionManager = function () {
    this.server = new grpc.Server();
    this.server.addService(this.rmSessionproto.service, {
        RequestRMSession: this._requestRMSession
    });
    return this.server;
}

exports.RMSessionManager.prototype.run = function () {
    this.rmSMServer = this._setRMSessionManager();
    this.rmSMServer.bindAsync('0.0.0.0:' + workerData.smPortNum,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('gRPC Server running at ' + this.rmSmAddr);
            this.rmSMServer.start();
        });
}

exports.RMSessionManager.prototype._createNewRMSession = function (dhNode) {
    dhNode['session_id'] = crypto.randomBytes(20).toString('hex')
    var rmSessParam = {
        sessionId: dhNode.rmsessionId,
        dhId: dhNode.dhId,
        dhIp: dhNode.dhIp,
        dhPort: dhNode.dhPort,
        pubvcRoot: this.pubvcRoot,
        mutexFlag: this.mutexFlag,
        errorFlag: this.errorSession
    };
    debug('Create New RMSession');
    debug(rmSessParam);
    var rmSession = new Worker(__dirname+'/RMSession/rmSession.js', {workerData: rmSessParam});
    rmSessionManager.rmSessionListToDaemon.push(dhNode);
    rmSessionManager.rmSessionDict[dhNode.sessionId] = rmSession;

    rmSessionManager.session_init_patch().then((git_patch) => {
        debug("git Patch")
        debug(git_patch.commitNumbers);
        rmSession.postMessage({
            event: "INIT",
            data: {
                patch: git_patch.patch,
                commitNumbers: git_patch.commitNumbers
            }
        });
    });
};


// Session 최초 연결 시 최초 git_patch 보내는 함수
exports.RMSessionManager.prototype.session_init_patch = async function() {
    debug("Session Init Patch");
    var first_commit= rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvcRoot);
    if(!fs.existsSync(rmSessionManager.msgStorepath)) rmSessionManager._save_last_commit(rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvcRoot));
    var content = rmSessionManager.__read_dict();
    debug("First Commit: " + first_commit);
    debug("Previous LC: " + content.previousLastCommit);

    if (first_commit == content.previous_last_commit) {
        // first add all the things in the folder and commit them
        execSync('cd ' + rmSessionManager.pVC.vcRoot + " && git add ./");
        var stdout = execSync('cd ' + rmSessionManager.pVC.vcRoot + ' && git commit -m "asdf" && git rev-parse HEAD');
        var printed = stdout.toString().split('\n');
        printed.pop();
        var comm = printed.pop();
        content.stored = content.stored+1;
        content.commitNumber.push(comm);
        rmSessionManager._save_last_commit(comm);
        var git_patch = await rmSessionManager.extractGitDiff(content);
        return git_patch;
    }
    // DH2 이후인 경우
    else {
        var git_patch = await rmSessionManager.extractInitPatch(content.previousLastCommit, first_commit);
        return git_patch;
    }
}

// 구현해야야 하는 기능 목록 
// 1. UPDATE 마다 GIT PATCH 추출해서 보내기
// 2. 특정 Session에서 오류가 발생한 경우, 기다리기
// 3. Commit 번호 기억하기
// 4. gRPC에 Commit번호 추가로 보내기


// 1
exports.RMSessionManager.prototype.extractInitPatch= async function(last_commit, first_commit){
    // patch from the first commit. Ref: https://stackoverflow.com/a/40884093
    var patch= execSync('cd ' + this.pubvcRoot + ' && git diff --no-color ' + first_commit + ' '+ last_commit);
    var toreturn = {
        patch: patch.toString(),
        commitNumbers: [first_commit, last_commit]
    };
    return toreturn;
}

exports.RMSessionManager.prototype.extractGitDiff = async function(topublish) {
    if (this.mutexFlag[0] == 1) {
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, topublish);
    }
    else {
        this.mutexFlag[0] = 1;
        var git_diff = execSync('cd ' + this.pubvcRoot + ' && git diff --no-color ' + topublish.previousLastCommit + ' ' + topublish.commitNumber[topublish.stored - 1]);
        this.mutexFlag[0] = 0;
        debug(git_diff);
        var toreturn = {
            patch: git_diff.toString(),
            commitNumbers: [topublish.previousLastCommit, topublish.commitNumber[topublish.stored - 1]]
        }
        return toreturn;
    }
}

exports.RMSessionManager.prototype.updateHandler = function(commit_number) {
    // GIT PATCH EXTRACTION
    var content = this.__read_dict();
    content.stored = content.stored + 1;
    content.commitNumber.push(commit_number);
    this.__save_dict(content);

    const topublish = this.__read_dict();
    this._save_last_commit(topublish.commitNumber[topublish.commitNumber.length - 1]);
    const git_patch = rmSessionManager.extractGitDiff(topublish);

    // GIT PATCH BROADCAST
    for (var key in rmSessionManager.rmSessionDict) {
        rmSessionManager._rmSessionUpdateReferenceModel(rmSessionManager.rmSessionDict[key], git_patch)
    }
}

exports.RMSessionManager.prototype.delayed_updateHandler = function() {
    if (rmSessionManager.errorSession[0] > 0) {
        rmSessionManager.poolTimer = setTimeout(rmSessionManager.delayed_updateHandler, 100);
    }
    else {
        rmSessionManager.pool_timer = null;
        rmSessionManager.updateHandler(delayedCommitNumbers);
        rmSessionManager.delayedCommitNumbers = "";
    }
}

// 3
exports.RMSessionManager.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msgStorepath, contentJSON);
}

exports.RMSessionManager.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msgStorepath.toString()));
}

exports.RMSessionManager.prototype._save_last_commit = function(last_commit) {
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    const content = {
        stored: 0,
        commitNumber: [],
        previousLastCommit: lc
    }
    this.__save_dict(content);
}

const rmSessionManager = new rmSM.RMSessionManager();
rmSessionManager.run();
