const { parentPort, workerData } = require('worker_threads');
const { publishVC } = require(__dirname + '/versionController');
const { vcConsumer } = require(__dirname+'/vcConsumer');
const vcModule = require(__dirname+'/vcModule');

//
exports.vcModule = function(){
    const gitDir = __dirname + '/gitDB';
    const kafkaHost = workerData.kafkaHost; // update
    const options = workerData.kafka; // update
    this.smPort = workerData.sm_port;
    this.vc = new publishVC(gitDir, workerData.rmsync_root_dir);
    this.consumer = new vcConsumer(kafkaHost, options, this);
    var self = this;
    parentPort.on('message', message => {
        switch(message.event) {
            case 'UPDATE_REFERENCE_MODEL':
                self.vc.addReferenceModel(message.RM);
        }
    });
};


exports.vcModule.prototype.init = async function(){
    await this.vc.init().then((commit_number) => {
        if (typeof commit_number !== 'undefined') {
            const msg = {
                event: "FIRST_COMMIT",
                first_commit_number: commit_number
            };
            this.smPort.postMessage(msg);
        };
    });
};

exports.vcModule.prototype.run = function(){
    this.consumer.run();

};

exports.vcModule.prototype.commit = async function(filepath, message){
    // message양식 확인
    await this.vc.commit(filepath, message).then((commNum) => this.reportCommit(filepath, message.related, message.id, commNum));
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


const VC = new vcModule.vcModule();
VC.init();
VC.run();
