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
    this.referenceModel = workerData.kafka_options;
    this.vc = new publishVC(gitDir, this.referenceModel);
    this.consumer = new vcConsumer(kafkaHost, options, this);
};

exports.vcModule.prototype.init = async function(){
    await this.vc.init();
};

exports.vcModule.prototype.run = function(){
    this.consumer.run();

};

exports.vcModule.prototype.commit = async function(filepath, message){
    await this.vc.commit(filepath, message);
};

exports.vcModule.prototype.reportCommit = function(filepath, assetID, commitNumber){
    // TODO
    const msg = {
        event: 'UPDATE_PUB_ASSET',
        data: {
            asset_id: assetID,
            commit_number: commitNumber
        }
    };
    this.smPort.postMessage(msg);
};


const VC = new vcModule.vcModule();
VC.init();
VC.run();
