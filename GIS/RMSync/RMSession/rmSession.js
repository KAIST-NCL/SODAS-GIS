const fs = require('fs');
const {parentPort, workerData} = require('worker_threads');
const {publishVC} = require('../../VersionControl/versionController')
const PROTO_PATH = __dirname + '/../proto/rmSessionSync.proto';
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
const session = require(__dirname + '/rmSession');
const debug = require('debug')('sodas:session');


/**
 * RMSession은 DIS와 연동하여 레퍼런스 모델 및 딕셔너리를 전달하는 모듈이다
 * @constructor
 */
exports.RMSession = function() {
    debug("[LOG] GS Session Created");
    debug(workerData);

    // Workerdata 파싱
    this.id = workerData.sessionId;
    this.target = workerData.dhIp + ':' + workerData.dhPort;
    this.dhId = workerData.dhId;
    debug('[LOG] Target:' + this.target);
    this.pubRMDir = workerData.pubvcRoot;
    this.VC = new publishVC(this.pubRMDir);
    // Mutex_Flag for Git
    this.flag = workerData.mutexFlag;
    this.errorflag = workerData.errorFlag;

    // Last Commit History
    this.lastCommitNumber = "";

    self = this;

    /// Thread Calls from Parent
    parentPort.on('message', function(message) {self._smListener(message)});
}

/**
 * :ref:`rmSessionManager` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param {dictionary(event,data)} message - 스레드 메시지
 * @param {string} message:event - ``INIT``, ``UPDATE_REFERENCE_MODEL``,
 * @see RMSessionManager._createNewRMSession
 * @see RMSessionManager._rmSessionUpdateReferenceModel
 */
exports.RMSession.prototype._smListener = function (message) {
    debug("[Session ID: " + this.id + "] Received Thread Msg ###");
    debug(message);
    switch(message.event) {
        // Information to init the Session
        case 'INIT':
            // gRPC client creation
            this.grpc_client = new session_sync.RMSessionSync(this.target, grpc.credentials.createInsecure());
            // get the first_commit
            this.lastCommitNumber = this.VC.returnFirstCommit(this.VC, this.pubRMDir);
            // Init patch
            this.publish(message.data);
            break;
        // receive message from SessionManager
        case 'UPDATE_REFERENCE_MODEL':
            debug(message.data);
            // data: {git_patch: git_patch}
            // 바로 publish한다
            this.publish(message.data);
            break;
    }
}

/**
 * 연동된 DIS 에게 referenceModel 관련 git Patch 를 전달하는 함수
 * @method
 * @param {dictionary(patch, operation, commitNumbers)} git_patch - git Patch
 * @param {string} git_patch:patch - git Diff 추출 결과물
 * @param {string} git_patch:operation - ``CREATE``혹은 ``UPDATE``
 * @param {Array} git_patch:commitNumbers - git Diff 추출에 사용된 커밋 번호 2개
 */
exports.RMSession.prototype.publish = function(git_patch) {
    // first check verification
    if (this.lastCommitNumber == git_patch.commitNumbers[0]) {
        debug("[LOG] Publish");
        // Make the message body to send
        var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                    'gitPatch': git_patch.patch,
                    'receiverId': this.dhId,
                    'operation': git_patch.operation
                };

        // gRPC transmittion
        this.grpc_client.SessionComm(toSend, function(err, response) {
            if (err) throw err;
            if (response.transID = toSend.transID && response.result == 0) {
                debug("[LOG] Publish Communication Successfully");
            }
            else {
                debug("[ERROR] Error on Publish Communication");
            }
        });
        this.lastCommitNumber = git_patch.commitNumbers[1];
    }
    else {
        // Report Error
        this.errorflag[0] = this.errorflag[0] + 1;
        // Start ErrorHandling
        this.extractGitDiff(this.lastCommitNumber, git_patch.commitNumbers[1]).then((git_patch) => {
            var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                    'gitPatch': git_patch.patch,
                    'receiverId': this.dhId,
                    'operation': git_patch.operation
                };
            // gRPC transmittion
            this.grpc_client.SessionComm(toSend, function(err, response) {
                if (err) throw err;
                if (response.transID = toSend.transID && response.result == 0) {
                    debug("[LOG] Publish Communication Successfully");
                }
                else {
                    debug("[ERROR] Error on Publish Communication");
                }
            });
            this.lastCommitNumber = git_patch.commitNumbers[1];
            this.errorflag[0] = this.errorflag - 1;
        });
    }
}

// Extract Git Diff
/**
 * 두 commit 번호 사이 git Patch 를 추출하는 함수
 * @method
 * @param {string} firstCommit - git Patch 추출 대상이 되는 첫번째 commit 번호
 * @param {string} lastCommit - git Patch 추출 대상이 되는 마지막 commit 번호
 * @returns toReturn - dictionary(patch, commitNumbers) 구조의 gitPatch file 과 관련 commit 번호
 */
exports.RMSession.prototype.extractGitDiff= async function(firstCommit, lastCommit){
    if (this.flag[0] == 1) {
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, firstCommit, lastCommit);
    }
    else {
        this.flag[0] = 1;
        var patch = execSync('cd ' + this.pubvcRoot + ' && git diff --no-color ' + firstCommit + ' ' + lastCommit);
        this.flag[0] = 0;
        var toReturn = {
            patch: patch.toString(),
            commitNumbers: [firstCommit, lastCommit]
        };
        return toReturn;
    }
}

// Data Storing
/**
 * rmSession의 내부 변수를 JSON으로 저장하는 함수
 * @method
 * @private
 * @param {dictionary} content
 */
exports.RMSession.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msgStorepath, contentJSON);
}

/**
 * JSON으로 저장된 rmSession 내부 변수를 불러오는 함수
 * @method
 * @private
 */
exports.RMSession.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msgStorepath).toString());
}

const ss = new session.RMSession();
