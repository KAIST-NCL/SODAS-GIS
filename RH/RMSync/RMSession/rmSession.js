const fs = require('fs');
const {parentPort, workerData} = require('worker_threads');
const {publishVC} = require('../../VersionControl/versionController')
const PROTO_PATH = __dirname + '/../proto/rmSessionSync.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const execSync = require('child_process').execSync;
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })
const session_sync = grpc.loadPackageDefinition(packageDefinition).RMSessionSyncModule;
const session = require(__dirname + '/rmSession');
const debug = require('debug')('sodas:session');


/// Constructor
exports.Session = function() {
    debug("[LOG] RH Session Created");
    debug(workerData);
    this.id = workerData.session_id;
    this.target = workerData.dh_ip + ':' + workerData.dh_port;
    this.dh_id=workerData.dh_id;
    debug('[LOG] Target:' + this.target);
    this.pubRM_dir = workerData.pubvc_root;
    this.VC= new publishVC(this.pubRM_dir);
    this.msg_storepath = this.pubRM_dir+'/../msgStore.json'
    // Mutex_Flag for Git
    this.flag = workerData.mutex_flag;
    // FirstCommit Extraction from RM directiory
    if(!fs.existsSync(this.msg_storepath)) this._save_last_commit(this.VC.returnFirstCommit(this.VC, this.pubRM_dir));
    /// Thread Calls from Parent
    parentPort.on('message', message => {
        debug("[Session ID: " + this.id + "] Received Thread Msg ###");
        debug(message);
        switch(message.event) {
            // Information to init the Session
            case 'INIT':
                // gRPC client creation
                this.grpc_client = new session_sync.RMSessionSync(this.target, grpc.credentials.createInsecure());
                // Creat Init patch
                // If the saved last commit and first commit from PubVC is the same - > server first operation
                // If not the same - > server has been stopped and started again
                var first_commit= this.VC.returnFirstCommit(this.VC, this.pubRM_dir);
                var content = this.__read_dict();
                debug("First Commit: " + first_commit);
                debug("Previous LC: " + content.previous_last_commit);
                if (first_commit == content.previous_last_commit) {
                    // first add all the things in the folder and commit them
                    execSync('cd ' + this.VC.vcRoot + " && git add ./");
                    var stdout = execSync('cd ' + this.VC.vcRoot + ' && git commit -m "asdf" && git rev-parse HEAD');
                    var printed = stdout.toString().split('\n');
                    printed.pop();
                    var comm = printed.pop();
                    content.stored = content.stored+1;
                    content.commit_number.push(comm);
                    this._save_last_commit(comm);
                    this.extractGitDiff(content).then((git_diff) => {
                        debug(git_diff);
                        this.Publish(git_diff);
                    });
                }
                break;
            // receive message from SessionManager
            case 'UPDATE_REFERENCE_MODEL':
                debug(message.data);
                this.prePublish(message);
                break;
        }
    });
}

exports.Session.prototype.prePublish = function(message) {
    // save information in message in a file as log
    var content = this.__read_dict();
    content.stored = content.stored + 1;
    content.commit_number.push(message.data.commit_number);
    this.__save_dict(content);
    //publish things to the counter DH RMSync
    const topublish = this.__read_dict();
    this._save_last_commit(topublish.commit_number[topublish.commit_number.length - 1]);
    // git diff extraction
    this.extractGitDiff(topublish).then((git_diff) => {
        this.Publish(git_diff);
    });
}

exports.Session.prototype.extractInitPatch= async function(init_commit){
    // patch from the first commit. Ref: https://stackoverflow.com/a/40884093
    var patch= execSync('cd ' + this.pubRM_dir + ' && git diff ' + init_commit + ' HEAD');
    return patch;
}

/// Extract git diff using two git commit numbers
exports.Session.prototype.extractGitDiff = async function(topublish) {
    if (this.flag[0] == 1) {
        // retry git diff
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, topublish);
    }
    else {
        this.flag[0] = 1;
        var git_diff = execSync('cd ' + this.pubRM_dir + ' && git diff --no-color ' + topublish.previous_last_commit + ' ' + topublish.commit_number[topublish.stored - 1]);
        this.flag[0] = 0;
        debug(git_diff);
        return git_diff;
    }
}

// last_commit: string. commit # of last git commit
exports.Session.prototype._save_last_commit = function(last_commit) {
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    const content = {
        stored: 0,
        commit_number: [],
        previous_last_commit: lc
    }
    this.__save_dict(content);
}

/// Publish to the counter DH RMSync Session
// git_patch: string. Git diff Extraction result
exports.Session.prototype.Publish = function(git_patch) {
    debug("[LOG] Publish");
    // Make the message body to send
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'git_patch': git_patch,
                  'receiver_id': this.dh_id};

    // gRPC transmittion
    this.grpc_client.SessionComm(toSend, function(err, response) {
        if (err) throw err;
        if (response.transID = toSend.transID && response.result == 0) {
            debug("[LOG] Publish Communication Successfully");
        }
        else {
            debug("[ERROR] Error on Publish Communication");
        }
    });
}

// Data Storing
exports.Session.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msg_storepath, contentJSON);
}

exports.Session.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msg_storepath.toString()));
}

const ss = new session.Session();
