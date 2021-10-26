const session  = require('./session');
const path = require('path');
const fs = require('fs');
const { Git } = require('../Lib/git');
const gitDIR = "./gitDB";
const timeOut = 10;
const PROTO_PATH = __dirname + '/proto/sessionSync.proto';
const gRPCClient = require('./gRPC/fileTransfer');

/* Session */
exports.Session = function(gitDIR, target){
    this.git = new Git(gitDIR);
    this.target = target;
};
exports.Session.prototype.init = async function(){
    await this.git.init();
};
exports.Session.prototype._run = function(pastCommitID){
    const curCommitID = this.git.getCurCommit();
    const diff_dir = './';
    if(curCommitID === pastCommitID){
        setTimeout(this._run.bind(this), timeOut, curCommitID);
        return;
    }
    // extract diff patch file
    this.git.diff(pastCommitID, curCommitID, diff_dir);
    // diff file transfer with commit number
    console.log('complete to extract diff patch');
    gRPCClient.fileTrasnfer(this.target, './'+ curCommitID + '.patch');

    setTimeout(this._run.bind(this), timeOut, curCommitID);
};
exports.Session.prototype.run = function(){
     let initialCommit = this.git.getCurCommit();
    console.log('Start to run from ' + initialCommit);
    setTimeout(this._run.bind(this), timeOut, initialCommit);
};

/* Main Run */
// if __name__ == __main__:
if (require.main === module){
    let sess  = new session.Session(gitDIR, '0.0.0.0:50000');
    sess.init().then(() => {sess.run()});
}