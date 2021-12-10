const { fstat } = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');

//
exports.vcModule = function(){
    ////////////////////////////////////////////////////////////////////////////////////////////////
    console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
    console.log("vcModule created");
    console.log("vcModule - workerData: " + workerData);
    console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
    ////////////////////////////////////////////////////////////////////////////////////////////////
    const gitDir = workerData.pubvc_root;
    const kafkaHost = workerData.kafkaHost; // update
    const options = workerData.kafka; // update
    this.smPort = workerData.sm_port;
    this.vc = new publishVC(gitDir, workerData.rmsync_root_dir);
    this.consumer = new vcConsumer(kafkaHost, options, this);
    this.flag = workerData.flag; // mutex flag
    var self = this;
    parentPort.on('message', message => {
        console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
        console.log("vcModule Received message: " + message);
        console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
        switch(message.event) {
            case 'UPDATE_REFERENCE_MODEL':
                self.vc.addReferenceModel(message.RM);
        }
    });
};


exports.vcModule.prototype.init = async function(){
    var self = this;
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

exports.vcModule.prototype.commit = async function(self, filepath, commitmessage, message){
    // message양식 확인
    var fp = self.vc.vcRoot + '/' + filepath;
    await self.vc.commit(fp, commitmessage, self).then((commNum) => self.reportCommit(filepath, message.related, message.id, commNum));
};

exports.vcModule.prototype.reportCommit = function(filepath, related, assetID, commitNumber){
    // TODO
    const msg = {
        event: 'UPDATE_PUB_ASSET',
        data: {
            asset_id: assetID,
            commit_number: commitNumber,
            related: related,
            filepath: filepath
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
}

exports.vcModule.prototype.lockMutex = function (self) {
    self.flag[0] = 1;
}

exports.vcModule.prototype.unlockMutex = function (self) {
    self.flag[0] = 0;
}


const VC = new vcModule.vcModule();
VC.init();
VC.run();
