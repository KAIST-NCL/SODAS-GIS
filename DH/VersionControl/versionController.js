const { Git } = require(__dirname + '/../Lib/versionControl');
const { parentPort, workerData } = require('worker_threads');
const { VC } = require('./dmVersionControl');

exports.VC = function(){
    this.vcRoot = __dirname + '/gitDB';
    this.get = new Git(this.vcRoot);
};

const vcWorker = VC();
