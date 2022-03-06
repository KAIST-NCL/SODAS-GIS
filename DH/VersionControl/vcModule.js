const { fstat } = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');
const diff_parser = require(__dirname+'/../Lib/diff_parser');
const execSync = require('child_process').execSync;

//
exports.vcModule = function(){
    ////////////////////////////////////////////////////////////////////////////////////////////////
    console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
    console.log("vcModule created");
    console.log("vcModule - workerData: ");
    console.log(workerData);
    console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
    ////////////////////////////////////////////////////////////////////////////////////////////////
    const gitDir = workerData.pubvc_root;
    const kafkaHost = workerData.kafkaHost; // update
    const options = workerData.kafka; // update

    this.smPort = workerData.sm_port;
    this.vc = new publishVC(gitDir, workerData.rmsync_root_dir);
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
        console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
        console.log("vcModule Received message: ");
        console.log(message);
        console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
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
    await this.vc.init().then((commit_number) => {
        console.log("initiation done ()()()()()()()");
        console.log(commit_number);
        if (typeof commit_number !== 'undefined') {
            // fs.writeFileSync(self.)
        };
    });
};

exports.vcModule.prototype.run = function(){
    this.consumer.run();

};

exports.vcModule.prototype.commit = async function(self, message){
    // message양식 확인
    var fp = self.vc.vcRoot + '/';  
    var commNum = await self.vc.commit(fp, message, self, self.reportCommit);
};

exports.vcModule.prototype.reportCommit = function(self, commitNumber){
    // Change Log - > data part has decreased

    // Change Log - > filepath extraction using git show add
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
    console.log("*&*&*&*& - Sent Message: ");
    console.log(msg);
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
}

exports.vcModule.prototype.lockMutex = function (self) {
    self.flag[0] = 1;
}

exports.vcModule.prototype.unlockMutex = function (self) {
    self.flag[0] = 0;
}

exports.vcModule.prototype.git_run = function (self) {
    now = new Date().getTime();
    if (self.count >= 1 && now - self.last_commit_time >= self.sync_time) {
        console.log('Commit');
        self.count = 0;
        self.commit(self, now.toString());
        self.last_commit_time = now;
    }
    setTimeout(self.git_run, self.timeOut, self);
}

const VC = new vcModule.vcModule();
VC.init();
VC.run();
VC.git_run(VC);
