const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');
const debug = require('debug')('sodas:vcModule');

/**
 * VersionControl 프로세스를 관리하는 모듈
 * @constructor
 */
exports.vcModule = function(){
    debug("[LOG] vcModule created");
    debug("[LOG] workerData ");
    debug(workerData);

    const RMgitDir = workerData.pubvcRoot;
    const kafkaHost = workerData.kafka;
    const options = workerData.kafkaOptions;
    this.smPort = workerData.smPort;
    // Create VC
    this.vc = new publishVC(RMgitDir);
    this.consumer = new vcConsumer(kafkaHost, options, this);
    this.flag = workerData.mutexFlag; // mutex flag
};

/**
 * `publishVC` 모듈의 초기화 함수를 호출함으로써, pubvc gitDB 의 초기 commit 을 수행함.
 * @method
 */
exports.vcModule.prototype.init = async function(){
    var self = this;
    this.unlockMutex(self);
    await this.vc.init()
        .then((commit_number) => {
            debug("[LOG] initiation done: commit_number:  ", commit_number);
        })
        .catch((e) => {debug(e)});
};

/**
 * `vcConsumer` 모듈의 실행 함수를 호출함으로써, Kafka Consumer 를 구동함.
 * @method
 */
exports.vcModule.prototype.run = function(){
    this.consumer.run();
};

/**
 * `vcConsumer` 에서 전달된 내용을 기반으로 `versionController` 의 git commit 함수 호출
 * @method
 * @param {vcModule} self - vcModule 객체
 * @param {dictionary} message - send.asset 메시지
 * @see publishVC.commit
 */
exports.vcModule.prototype.commit = async function(self, message) {
    var fp = self.vc.vcRoot + '/';
    await self.vc.commit(fp, message, self);
};

/**
 * `versionController` 에서 git commit 후 전달한 commitNumber 를 `rmSessionManager` 에게 전달
 * @method
 * @param {vcModule} self - vcModule 객체
 * @param {string} commitNumber - git commit 번호
 * @see RMSessionManager._vcListener
 */
exports.vcModule.prototype.reportCommit = function(self, commitNumber){
    // send commit number to SessionManager
    const msg = {
        event: 'UPDATE_REFERENCE_MODEL',
        data: {
            commitNumber: commitNumber,
        }
    };
    this.smPort.postMessage(msg);
};

/**
 * kafka로 전달받은 referenceModel, dictionary 내용을 파일로 저장/수정/삭제하는 함수
 * @method
 * @param {string} option - 처리 방법: 저장/수정/삭제
 * @param {string} filepath - 파일 경로
 * @param {string} type - 파일 종류: doamin, taxonomy, ...
 * @param {string} content - 저장할 내용
 */
exports.vcModule.prototype.editFile = async function(option, filepath, type, content) {
    var fp = filepath;
    switch (option) {
        case 'UPDATE':
            this.vc.git.editFile(fp, content);
            break;
        case 'DELETE':
            if (type != 'domain'){
                console.log("tenantGroup/taxonomy/taxonomyVersion file cannot be deleted");
                break;
            }
            this.vc.git.deleteFile(fp);
            break;
        case 'CREATE':
            var fd = fs.openSync(fp, 'w');
            fs.writeSync(fd, content);
            break;
    }
};

/**
 * @method
 */
exports.vcModule.prototype.lockMutex = function (self) {
    self.flag[0] = 1;
};

/**
 * @method
 */
exports.vcModule.prototype.unlockMutex = function (self) {
    self.flag[0] = 0;
};

const VC = new vcModule.vcModule();
VC.init();
VC.run();
