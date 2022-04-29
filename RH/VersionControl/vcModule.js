const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');
const debug = require('debug')('sodas:vcModule');

/// Constructor
exports.vcModule = function(){
    debug("[LOG] vcModule created");
    debug("[LOG] workerData ");
    debug(workerData);

    const RMgitDir = workerData.pubvc_root;
    const kafkaHost = workerData.kafka; 
    const options = workerData.kafka_options; 
    this.smPort = workerData.sm_port;
    // Create VC 
    this.vc = new publishVC(RMgitDir);
    this.consumer = new vcConsumer(kafkaHost, options, this);
    this.flag = workerData.mutex_flag; // mutex flag
};

exports.vcModule.prototype.init = async function(){
    var self = this;
    this.unlockMutex(self);
    await this.vc.init()
        .then((commit_number) => {
            debug("[LOG] initiation done: commit_number:  ", commit_number);
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
    // send commit number to SessionManager
    const msg = {
        event: 'UPDATE_REFERENCE_MODEL',
        data: {
            commit_number: commitNumber,
        }
    };
    this.smPort.postMessage(msg);
};

exports.vcModule.prototype.editFile = async function(option, filepath, type, content) {
    var fp = filepath;
    switch (option) {
        case 'UPDATE': 
            this.vc.git.editFile(fp, content);
            break;
        case 'DELETE':
            if (type == 'domain_version'){
                console.log("domain-version file cannot be deleted");
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

exports.vcModule.prototype.lockMutex = function (self) {
    self.flag[0] = 1;
};

exports.vcModule.prototype.unlockMutex = function (self) {
    self.flag[0] = 0;
};

const VC = new vcModule.vcModule();
VC.init();
VC.run();
