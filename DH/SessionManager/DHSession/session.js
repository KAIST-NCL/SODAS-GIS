const fs = require('fs');
const path = require('path');
const diff_parser = require('../../Lib/diff_parser');
var kafka = require('kafka-node');
const {parentPort, workerData} = require('worker_threads');
const {subscribeVC } = require('../../VersionControl/versionController')
const PROTO_PATH = __dirname + '/../proto/sessionSync.proto';
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
const session_sync = grpc.loadPackageDefinition(packageDefinition).SessionSyncModule;
const session = require(__dirname + '/session');
const debug = require('debug')('sodas:session');
const tools = require('../../Lib/tools');

/// Constructor
// workerData -> my_session_id, my_ip, my_portNum
exports.Session = function() {
    debug("[LOG] Session Created");
    debug(workerData);
    this.countMsg = 0;

    this.pubvcRoot = workerData.pubvcRoot;
    // Root Dir Creation
    this.id = workerData.mySessionId;
    this.rootDir = workerData.subvcRoot+'/'+this.id;
    !fs.existsSync(this.rootDir) && tools.mkdirSyncRecursive(this.rootDir);

    // Settings for storing thread call information
    this.msgStorepath = this.rootDir+'/msgStore.json'
    this.lastCommitTime = new Date().getTime();
    this.timeOut = 5;

    // Settings for GitDB
    this.VC = new subscribeVC(this.rootDir+'/gitDB');
    this.VC.init();
    
    // Mutex_Flag for Git
    this.flag = workerData.mutexFlag; // mutex flag

    // FirstCommit Extraction from PubVC
    this._reset_count(this.VC.returnFirstCommit(this.VC, this.pubvcRoot));

    // Run gRPC Server
    this.ip = workerData.myIp;
    this.myPort = workerData.myPortNum;
    this.server = new grpc.Server();
    var self = this;
    this.server.addService(session_sync.SessionSync.service, {
        // (1): Subscription from counter session
        SessionComm: (call, callback) => {
            self.Subscribe(self, call, callback);
        }
    });

    /// Thread Calls from Parent
    parentPort.on('message', message => {
        debug("[Session ID: " + this.id + "] Received Thread Msg ###");
        debug(message);
        switch(message.event) {
            // Information to init the Session
            case 'INIT':
                this._init(this);
                break;
            // Information about counter session
            case 'TRANSMIT_NEGOTIATION_RESULT':
                // Get the counter session's address + port
                this.target = message.data.endPoint.ip + ':' + message.data.endPoint.port;
                debug('[LOG] Target:' + this.target);
                // gRPC client creation
                this.grpc_client = new session_sync.SessionSync(this.target, grpc.credentials.createInsecure());
                this.sessionDesc = message.data.sessionDesc;
                this.snOptions = message.data.snOptions; // sync_interest_list, data_catalog_vocab, sync_time, sync_count, transfer_interface
                this.run(this);
                break;
            // Things to publsih
            case 'UPDATE_PUB_ASSET':
                this.countMsg += 1;
                this.prePublish(this, message.data);
                break;
        }
    });
}

/// Initiate Session
exports.Session.prototype._init = function(self) {
    const addr = self.ip+':'+self.myPort;
    self.server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), ()=> {
        self.server.start();
    });
}

/// [4]: hanldes the msg from Session Manager
// message: dict. data part of thread call "UPDATE_PUB_ASSET"
exports.Session.prototype.prePublish = function(self, message) {
    // save the things in message in a file as log
    // change log: Now only the commit number is needed
    // ToDo: Rather than calling this function whenever receiving the thread call from SM, call this function just like the vcModule calls commit function
    var content = self.__read_dict();
    content.stored = content.stored + 1;
    content.commitNumber.push(message.commitNumber);
    self.__save_dict(content);
    if (self.countMsg >= self.snOptions.syncDesc.syncCount[0]) {
        debug("[LOG] Sync_count reached - clearTimeOout");
        clearTimeout(self.setTimeoutID);
        self.run(self);
    }
}

/// If the count / sync time reaches some point, extract the git diff and publish it to other session
exports.Session.prototype.onMaxCount = async function(self) {
    self.countMsg = 0;
    debug("[LOG] onMaxCount");
    // Read file first and reset the file
    const topublish = self.__read_dict();
    self._reset_count(topublish.commitNumber[topublish.commitNumber.length - 1]);
    // git diff extraction
    git_diff = await self.extractGitDiff(topublish)
    // Send gRPC message 
    if (git_diff) self.Publish(git_diff);
}

/// To extract git diff using two git commit numbers
// topublish: dict. Result of reading log file
exports.Session.prototype.extractGitDiff = async function(topublish) {
    // mutex 적용
    if (this.flag[0] == 1) {
        // retry diff
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, topublish);
    }
    else {
        // mutex on
        this.flag[0] = 1;
        var diff_directories = ' --';
        for (var i = 0; i < this.snOptions.datamapDesc.syncInterestList.length; i++) {
            diff_directories = diff_directories + ' ' + this.snOptions.datamapDesc.syncInterestList[i];
        }
        var git_diff = execSync('cd ' + this.pubvcRoot + ' && git diff --no-color ' + topublish.previousLastCommit + ' ' + topublish.commitNumber[topublish.stored - 1] + diff_directories);
        this.flag[0] = 0;
        // mutex off
        return git_diff;
    }
}

/// Reset count after publish
// last_commit: string. commit # of last git commit
exports.Session.prototype._reset_count = function(last_commit) {
    this.countMsg = 0;
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    // 파일 초기화
    const content = {
        stored: 0,
        commitNumber: [],
        previousLastCommit: lc
    }
    this.__save_dict(content);
}

/// [5]: Publish to the counter Session
// git_patch: string. Git diff Extraction result
exports.Session.prototype.Publish = function(git_patch) {
    debug("[LOG] Publish");
    // Change Log -> Now, does not send the related and filepath information through the gRPC. Subscriber extracts that information from git diff file

    // Make the message body to send
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'gitPatch': git_patch,
                  'receiverId': this.sessionDesc.sessionId};

    // gRPC transmittion
    this.grpc_client.SessionComm(toSend, function(err, response) {
        if (err) throw err;
        if (response.transID = toSend.transID && response.result == 0) {
            debug("[LOG] Publish Communicateion Successfull");
        }
        else {
            debug("[ERROR] Error on Publish Communication");
        }
    });
}

/// (1): Subscribe from the other session
// Change Log -> seperated from the constructor as an function
exports.Session.prototype.Subscribe = function(self, call, callback) {
    debug('[LOG] Server: ' + self.id + ' gRPC Received: to ' + call.request.receiverId);
    // Only process the things when sender's id is the same one with the counter session's id
    if (call.request.receiverId == self.id) {
        debug("[LOG] Git Patch Start");
        // git Patch apply
        var result = self.gitPatch(call.request.gitPatch, self);
        // ACK Transimittion
        // If no problem, result is 0. Otherwise is not defined yet.
        callback(null, {transID: call.request.transID, result: result})
        // Producing the Kafka message and publish it.
        self.kafkaProducer(call.request.gitPatch, self);
    }
}

// (2): Apply the git patch received through gRPC
exports.Session.prototype.gitPatch = function(git_patch, self) {
    // save git patch as a temporal file
    var patch = Math.random().toString(10).slice(2,5) + '.patch';
    var temp = self.rootDir + "/" + patch;
    try {
        fs.writeFileSync(temp, git_patch);
    } catch (err) {
        debug("[ERROR] ", err);
        return 1;
    }
    self.VC.apply("../" + patch);
    // remove the temporal file
    fs.existsSync(temp) && fs.unlink(temp, function (err) {
        if (err) {
            debug("[ERROR] ", err);
        }
    });
    return 0;
}

// (3): Producer: send.asset Message creation and Sending it
exports.Session.prototype.kafkaProducer = function(git_pacth, self) {
    // Change Log -> previous argument was {related, filepath} as json_string format. Now git diff
    // Change Log -> Extract the filepath and related information from the git diff string

    // get filepaths from the git_pacth
    var filepath_list = diff_parser.parse_git_patch(git_pacth);

    // Things to send - operation, id, related, content
    var payload_list = [];
    for (var i = 0; i < filepath_list.length; i++) {
        var filepath = filepath_list[i];
        var related = diff_parser.file_path_to_related(filepath);

        var temp = {
            "id": path.basename(filepath, '.asset'),
            "operation": "UPDATE",
            "type": "asset",
            "related": related,
            "content": fs.readFileSync(self.VC.vcRoot + '/' + filepath).toString()
        }
        payload_list.push(temp);
        debug("[LOG] Payload added " + temp.id);
    }
    
    debug('[LOG] kafka Producer start');

    var Producer = kafka.Producer;
    var client = new kafka.KafkaClient();
    var producer = new Producer(client);

    producer.on('error', function(err) {
        debug("[ERROR] kafkaproducer error");
        debug(err);
    })

    producer.on('ready', function() {
        for (var i=0; i < payload_list.length; i++) {
            var payloads = [
                { topic: 'recv.asset', messages:payload_list[i]}
            ];
            producer.send(payloads, function(err, result) {
                debug('[LOG]', result);
            });
        }
    });
    debug('[LOG] kafka Producer done');
}

// Data Storing
exports.Session.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msgStorepath, contentJSON);
}

exports.Session.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msgStorepath).toString());
}


exports.Session.prototype.run = function(self) {
    now = new Date().getTime();
    var condition_time = self.countMsg >= 1 && now - self.lastCommitTime >= self.snOptions.syncDesc.syncTime[0];
    var condition_count = (self.countMsg >= self.snOptions.syncDesc.syncCount[0]);
    if (condition_time || condition_count) {
        // Sync_time 초과 시 강제 진행
        self.onMaxCount(self);
    }
    setTimeout(self.run, self.timeOut, self);
}
const ss = new session.Session();
