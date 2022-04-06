const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');
const diff_parser = require(__dirname+'/../../DH/Lib/diff_parser');
const execSync = require('child_process').execSync;
const debug = require('debug')('sodas:vcModule');

var fd = fs.openSync(__dirname+"/msg_log.txt", 'a+');

/// Constructor
exports.vcModule = function(){
    ////////////////////////////////////////////////////////////////////////////////////////////////
    debug("[LOG] vcModule created");
    debug("[LOG] workerData ");
    debug(workerData);
    ////////////////////////////////////////////////////////////////////////////////////////////////
    const RMgitDir = workerData.rmgit_dir;
    const kafkaHost = workerData.kafkaHost; // update
    const options = workerData.kafka; // update

    this.smPort = workerData.sm_port;
    // Create VC 
    this.vc = new publishVC(RMgitDir);
    this.consumer = new vcConsumer(kafkaHost, options, this);
    this.flag = workerData.mutex_flag; // mutex flag

    this.last_commit_time = new Date().getTime();
    this.count = 0; // kafka message receive count

    // Change Log - > new value timeOut, sync_time has been added.
    // timeOut => used in setTimeOut. Period to check whether there is anything to commit
    // sync_time => commit period
    this.timeOut = workerData.commit_period.timeOut;
    this.sync_time = workerData.commit_period.period;

    var self = this;
    parentPort.on('message', message => {
        debug("[LOG] Received message: ", message);
        switch(message.event) {
            case 'UPDATE_REFERENCE_MODEL':
                // Change Log -> added self as argument of addReferenceModel
                //self.vc.addReferenceModel(self.vc, message.data);
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
    // Change Log - > data part has decreased

    // Change Log - > filepath extraction using git show add
    const stdout = execSync('cd ' + self.vc.vcRoot + ' && git show ' + commitNumber);
    filepath_list = diff_parser.parse_git_patch(stdout.toString());

    const msg = {
        event: 'UPDATE_REFERENCE_MODEL',
        data: {
            commit_number: commitNumber,
            filepath: filepath_list
        }
    };
    var to_append=JSON.stringify(msg)+'\n';
    console.log(to_append);
    fs.appendFileSync(fd,to_append,'utf8'); 
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
            //this.vc.git.createFile(fp, content);
            break;
    }
};

exports.vcModule.prototype.lockMutex = function (self) {
    self.flag[0] = 1;
};

exports.vcModule.prototype.unlockMutex = function (self) {
    self.flag[0] = 0;
};

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
const VC = new vcModule.vcModule();
VC.init();
VC.run();
VC.git_run(VC);
