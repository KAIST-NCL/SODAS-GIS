const { fstat } = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');
const diff_parser = require(__dirname+'/../Lib/diff_parser');
const execSync = require('child_process').execSync;
const debug = require('debug')('sodas:vcModule');

/// Constructor
exports.vcModule = function(){
    ////////////////////////////////////////////////////////////////////////////////////////////////
    debug("[LOG] vcModule created");
    debug("[LOG] workerData ");
    debug(workerData);
    ////////////////////////////////////////////////////////////////////////////////////////////////
    const gitDir = workerData.pubvc_root;
    const kafkaHost = workerData.kafka; // update
    const options = workerData.kafka_options; // update

    this.smPort = workerData.sm_port;
    this.vc = new publishVC(gitDir, workerData.rmsync_root_dir);
    this.consumer = new vcConsumer(kafkaHost, options, this);
    this.flag = workerData.mutex_flag; // mutex flag

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
        debug("[LOG] Received message: ", message);
        switch(message.event) {
            case 'UPDATE_REFERENCE_MODEL':
                // Change Log -> added self as argument of addReferenceModel
                self.vc.addReferenceModel(self.vc, message.data);
        }
    });
};

exports.vcModule.prototype.init = async function(){
    var self = this;
    this.unlockMutex(self);
    await this.vc.init()
        .then((commit_number) => {
            debug("[LOG] initiation done: commit_number:  ", commit_number);
            if (typeof commit_number !== 'undefined') {
                // fs.writeFileSync(self.)
                }
        })
        .catch((e) => {debug(e)});
};

exports.vcModule.prototype.run = function(){
    this.consumer.run();

};

exports.vcModule.prototype.commit = async function(self, message) {
    var fp = self.vc.vcRoot + '/';  
    await self.vc.commit(fp, message, self);
};

exports.vcModule.prototype.reportCommit = function(self, commitNumber){
    const stdout = execSync('cd ' + self.vc.vcRoot + ' && git show ' + commitNumber);
    filepath_list = diff_parser.parse_git_patch(stdout.toString());

    const msg = {
        event: 'UPDATE_PUB_ASSET',
        data: {
            commit_number: commitNumber,
            filepath: filepath_list
        }
    };
    this.smPort.postMessage(msg);
};

exports.vcModule.prototype.editFile = async function(option, filepath, content) {
    var fp = this.vc.vcRoot + '/' + filepath;
    switch (option) {
        case 'UPDATE':
            this.vc.git.editFile(fp, content);
            break;
        case 'DELETE':
            this.vc.git.deleteFile(fp);
            break;
    }
};

exports.vcModule.prototype.lockMutex = function (self) {
    self.flag[0] = 1;
};

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
