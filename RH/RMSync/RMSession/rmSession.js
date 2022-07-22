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

    // Workerdata 파싱
    this.id = workerData.session_id;
    this.target = workerData.dh_ip + ':' + workerData.dh_port;
    this.dh_id=workerData.dh_id;
    debug('[LOG] Target:' + this.target);
    this.pubRM_dir = workerData.pubvc_root;
    this.VC = new publishVC(this.pubRM_dir);
    // Mutex_Flag for Git
    this.flag = workerData.mutex_flag;
    this.errorflag = workerData.error_flag;

    // Last Commit History
    this.last_commit_number = "";

    /// Thread Calls from Parent
    parentPort.on('message', message => {
        debug("[Session ID: " + this.id + "] Received Thread Msg ###");
        debug(message);
        switch(message.event) {
            // Information to init the Session
            case 'INIT':
                // gRPC client creation
                this.grpc_client = new session_sync.RMSessionSync(this.target, grpc.credentials.createInsecure());
                // get the first_commit
                this.last_commit_number = this.VC.returnFirstCommit(this.VC, this.pubRM_dir);
                // Init patch
                this.publish(message.data);
                break;
            // receive message from SessionManager
            case 'UPDATE_REFERENCE_MODEL':
                debug(message.data);
                // data: {git_patch: git_patch}
                // 바로 publish한다
                this.publish(message.data.git_patch);
                break;
        }
    });
}

/// Publish to the counter DH RMSync Session
// git_patch: string. Git diff Extraction result
exports.Session.prototype.publish = function(git_patch) {
    // first check verification
    if (this.last_commit_number == git_patch.commit_numbers[0]) {  
        debug("[LOG] Publish");
        // Make the message body to send
        var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                    'git_patch': git_patch.patch,
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
        this.last_commit_number = git_patch.commit_numbers[1];
    }
    else {
        // Report Error
        this.errorflag[0] = this.errorflag[0] + 1;
        // Start ErrorHandling
        this.extractGitDiff(this.last_commit_number, git_patch.commit_numbers[1]).then((git_patch) => {
            var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                    'git_patch': git_patch.patch,
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
            this.last_commit_number = git_patch.commit_numbers[1];
            this.errorflag[0] = this.errorflag - 1;
        });
    }
}

// Extract Git Diff
exports.RMSessionManager.prototype.extractGitDiff= async function(first_commit, last_commit){
    if (this.mutex_flag[0] == 1) {
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, first_commit, last_commit);
    }
    else {
        this.mutex_flag[0] = 1;
        var patch= execSync('cd ' + this.pubvc_root + ' && git diff --no-color ' + first_commit + ' '+ last_commit);
        this.mutex_flag[0] = 0;
        var toreturn = {
            patch: patch.toString(),
            commit_numbers: [first_commit, last_commit]
        };
        return toreturn;
    }
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
