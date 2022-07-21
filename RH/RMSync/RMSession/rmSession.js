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
    this.VC= new publishVC(this.pubRM_dir);
    // Mutex_Flag for Git
    this.flag = workerData.mutex_flag;

    /// Thread Calls from Parent
    parentPort.on('message', message => {
        debug("[Session ID: " + this.id + "] Received Thread Msg ###");
        debug(message);
        switch(message.event) {
            // Information to init the Session
            case 'INIT':
                // gRPC client creation
                this.grpc_client = new session_sync.RMSessionSync(this.target, grpc.credentials.createInsecure());
                // Init patch
                this.publish(message.data.init_patch);
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
