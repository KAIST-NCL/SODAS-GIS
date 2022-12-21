const { fstat } = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');
const diff_parser = require(__dirname+'/../Lib/diff_parser');
const execSync = require('child_process').execSync;
const debug = require('debug')('sodas:vcModule\t|');

/**
 * VersionControl 프로세스를 관리하는 모듈
 * @constructor
 */
exports.vcModule = function(){
    ////////////////////////////////////////////////////////////////////////////////////////////////
    debug("[LOG] vcModule created");
    debug("[LOG] workerData ");
    debug(workerData);
    ////////////////////////////////////////////////////////////////////////////////////////////////
    const gitDir = workerData.pubvcRoot;
    const kafkaHost = workerData.kafka; // update
    const options = workerData.kafkaOptions; // update

    this.smPort = workerData.smPort;
    this.vc = new publishVC(gitDir, workerData.rmsyncRootDir);
    this.consumer = new vcConsumer(kafkaHost, options, this);
    this.flag = workerData.mutexFlag; // mutex flag

    /* Uncomment for Pooling
    this.last_commit_time = new Date().getTime();
    this.count = 0; // kafka message receive count

    // Change Log - > new value timeOut, sync_time has been added.
    // timeOut => used in setTimeOut. Period to check whether there is anything to commit
    // sync_time => commit period
    this.timeOut = workerData.commit_period.timeOut;
    this.sync_time = workerData.commit_period.period;
    */

    var self = this;
    parentPort.on('message', message => {
        debug("[LOG] Received message: ");
        debug(message);
        switch(message.event) {
            case 'UPDATE_REFERENCE_MODEL':
                // Change Log -> added self as argument of addReferenceModel
                self.vc.addReferenceModel(self.vc, message.data);
        }
    });
};

/**
 * `publishVC` 모듈의 초기화 함수를 호출함으로써, pubvc gitDB 의 초기 commit 을 수행함.
 * @method
 */
exports.vcModule.prototype.init = async function(){
    var self = this;
    this.unlockMutex(self);
    await this.vc.init()
        .then((commitNumber) => {
            debug("[LOG] initiation done: commit_number:  ", commitNumber);
            if (typeof commitNumber !== 'undefined') {
                // fs.writeFileSync(self.)
                }
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
 * @param {dictionary} message - `send.asset` 메시지
 * @see publishVC.commit
 */
exports.vcModule.prototype.commit = async function(self, message) {
    var fp = message;
    // used for pooling method
    // var fp = self.vc.vcRoot + '/';  
    await self.vc.commit(fp, message, self);
};

/**
 * `versionController` 에서 git commit 후 전달한 commitNumber 를 `SessionManager` 에게 전달
 * @method
 * @param {vcModule} self - vcModule 객체
 * @param {string} commitNumber - git commit 번호
 * @see SessionManager._vcListener
 */
exports.vcModule.prototype.reportCommit = function(self, commitNumber){
    const stdout = execSync('cd ' + self.vc.vcRoot + ' && git show ' + commitNumber);
    filepath_list = diff_parser.parse_git_patch(stdout.toString());

    const msg = {
        event: 'UPDATE_PUB_ASSET',
        data: {
            commitNumber: commitNumber,
            filepath: filepath_list
        }
    };
    this.smPort.postMessage(msg);
};

/**
 * kafka로 전달받은 asset 내용을 파일로 저장/수정/삭제하는 함수
 * @method
 * @param {string} option - 처리 방법: 저장/수정/삭제
 * @param {string} filepath - 파일 경로
 * @param {string} content - 저장할 내용
 */
exports.vcModule.prototype.editFile = async function(option, filepath, content) {
    var fp = this.vc.vcRoot + '/' + filepath;
    switch (option) {
        case 'CREATE':
            this.vc.git.editFile(fp, content);
            break;
        case 'UPDATE':
            this.vc.git.editFile(fp, content);
            break;
        case 'DELETE':
            this.vc.git.deleteFile(fp);
            break;
    }
};

/**
 * GitDB 사용 시 Mutex를 잠그는 함수
 * @method
 */
exports.vcModule.prototype.lockMutex = function (self) {
    self.flag[0] = 1;
};

/**
 * GitDB 사용 완료 후 Mutex 잠금을 해제하는 함수
 * @method
 */
exports.vcModule.prototype.unlockMutex = function (self) {
    self.flag[0] = 0;
};

/* Uncomment for Pooling Method
exports.vcModule.prototype.git_run = function (self) {
    now = new Date().getTime();
    if (self.count >= 1 && now - self.last_commit_time >= self.sync_time) {
        debug('[LOG] COMMIT');
        self.count = 0;
        self.commit(self, now.toString());
        self.last_commit_time = now;
    }
    setTimeout(self.git_run, self.timeOut, self);
};
*/

const VC = new vcModule.vcModule();
VC.init();
VC.run();
// VC.git_run(VC);
