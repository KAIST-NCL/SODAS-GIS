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

    this.VC = workerData.vc_port;
    this.VC.on('message', this._vcListener);

    this.rm_sm_addr = workerData.sm_ip + ':' + workerData.sm_portNum;
    this.pubvc_root = workerData.pubvc_root;
    this.mutex_flag = workerData.mutex_flag;

    this.pVC= new publishVC(this.pubvc_root);
    this.msg_storepath = this.pubvc_root+'/../msgStore.json'
    const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
    this.errorSession = new Int8Array(sharedArrayBuffer);
    this.errorSession[0] = 0;

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
    this.rmSession_list_to_daemon = [];
    debug('RMSessionManager thread is running')
};

/* Worker threads Listener */
exports.RMSessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        case 'UPDATE_REFERENCE_MODEL':
            debug('[RX: UPDATE_REFERENCE_MODEL] from VersionControl');
            debug(message.data);

            // GIT PATCH EXTRACTION
            var content = this.__read_dict();
            content.stored = content.stored + 1;
            content.commit_number.push(message.data.commit_number);
            this.__save_dict(content);

            const topublish = this.__read_dict();
            this._save_last_commit(topublish.commit_number[topublish.commit_number.length - 1]);
            const git_patch = rmSessionManager.extractGitDiff(topublish);

            // GIT PATCH BROADCAST
            for (var key in rmSessionManager.rmSessionDict) {
                rmSessionManager._rmSessionUpdateReferenceModel(rmSessionManager.rmSessionDict[key], git_patch)
            }
            break;
    }
}

exports.RMSessionManager.prototype._rmSessionUpdateReferenceModel = function (rmSessionWorker, git_patch) {
    rmSessionWorker.postMessage({
        event: "UPDATE_REFERENCE_MODEL",
        data: { git_patch: git_patch }
    });
}

exports.RMSessionManager.prototype._requestRMSession = function (call, callback) {
    debug("[RH] [RMSessionManager] - RequestRMSession");
    var dhNode = call.request
    debug("Request RMSession Connection from DH-RMSync");
    debug(dhNode);
    rmSessionManager._createNewRMSession(dhNode);
    callback(null, {result: 'OK', rm_session_id: rmSessionManager.rmSession_list_to_daemon[0].session_id})
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
    this.rmSMServer.bindAsync('0.0.0.0:' + workerData.sm_portNum,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('gRPC Server running at ' + this.rm_sm_addr);
            this.rmSMServer.start();
        });
}

exports.RMSessionManager.prototype._createNewRMSession = function (dhNode) {
    dhNode['session_id'] = crypto.randomBytes(20).toString('hex')
    var rmSessParam = {
        session_id: dhNode.session_id,
        dh_id: dhNode.dh_id,
        dh_ip: dhNode.dh_ip,
        dh_port: dhNode.dh_port,
        pubvc_root: this.pubvc_root,
        mutex_flag: this.mutex_flag
    };
    debug('Create New RMSession');
    debug(rmSessParam);
    var rmSession = new Worker(__dirname+'/RMSession/rmSession.js', {workerData: rmSessParam});
    rmSessionManager.rmSession_list_to_daemon.push(dhNode);
    rmSessionManager.rmSessionDict[dhNode.session_id] = rmSession;

    rmSessionManager.session_init_patch().then((git_patch) => {
        debug("git Patch")
        debug(git_patch.toString());
        rmSession.postMessage({
            event: "INIT",
            data: {
                init_patch: git_patch
            }
        });
    });
};


// Session 최초 연결 시 최초 git_patch 보내는 함수
exports.RMSessionManager.prototype.session_init_patch = async function() {
    debug("Session Init Patch");
    var first_commit= rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvc_root);
    if(!fs.existsSync(rmSessionManager.msg_storepath)) rmSessionManager._save_last_commit(rmSessionManager.pVC.returnFirstCommit(rmSessionManager.pVC, rmSessionManager.pubvc_root));
    var content = rmSessionManager.__read_dict();
    debug("First Commit: " + first_commit);
    debug("Previous LC: " + content.previous_last_commit);

    if (first_commit == content.previous_last_commit) {
        // first add all the things in the folder and commit them
        execSync('cd ' + rmSessionManager.pVC.vcRoot + " && git add ./");
        var stdout = execSync('cd ' + rmSessionManager.pVC.vcRoot + ' && git commit -m "asdf" && git rev-parse HEAD');
        var printed = stdout.toString().split('\n');
        printed.pop();
        var comm = printed.pop();
        content.stored = content.stored+1;
        content.commit_number.push(comm);
        rmSessionManager._save_last_commit(comm);
        var git_patch = await rmSessionManager.extractGitDiff(content);
        return git_patch;
    }
    // DH2 이후인 경우
    else {
        var git_patch = await rmSessionManager.extractInitPatch(content.previous_last_commit, first_commit);
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
    var patch= execSync('cd ' + this.pubvc_root + ' && git diff --no-color ' + first_commit + ' '+ last_commit);
    var to_return = {
        patch: patch,
        commit_number: [first_commit, last_commit]
    };
    return patch;
}

exports.RMSessionManager.prototype.extractGitDiff = async function(topublish) {
    if (this.mutex_flag[0] == 1) {
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, topublish);
    }
    else {
        this.mutex_flag[0] = 1;
        var git_diff = execSync('cd ' + this.pubvc_root + ' && git diff --no-color ' + topublish.previous_last_commit + ' ' + topublish.commit_number[topublish.stored - 1]);
        this.mutex_flag[0] = 0;
        debug(git_diff);
        var to_return = {
            patch: git_diff,
            commit_number: [topublish.previous_last_commit, topublish.commit_number[topublish.stored - 1]]
        }
        return to_return;
    }
}

exports.RMSessionManager.prototype.updateHandler = async function(message) {
    // Error가 발생한 세션이 있는 동안에는 작업을 대기한다.
    if (this.errorSession > 0) {
        
    }
}


// 3
exports.RMSessionManager.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msg_storepath, contentJSON);
}

exports.RMSessionManager.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msg_storepath.toString()));
}

exports.RMSessionManager.prototype._save_last_commit = function(last_commit) {
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    const content = {
        stored: 0,
        commit_number: [],
        previous_last_commit: lc
    }
    this.__save_dict(content);
}

const rmSessionManager = new rmSM.RMSessionManager();
rmSessionManager.run();
