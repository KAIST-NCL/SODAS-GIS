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


/// Constructor
// workerData -> my_session_id, my_ip, my_portNum
exports.Session = function() {
    debug("[LOG] Session Created");
    debug(workerData);
    this.count_msg = 0;

    this.pubvc_root = workerData.pubvc_root;
    // Root Dir Creation
    this.id = workerData.my_session_id;
    this.rootDir = workerData.subvc_root+'/'+this.id;
    !fs.existsSync(this.rootDir) && fs.mkdirSync(this.rootDir, {recursive: true});

    // Settings for storing thread call information
    this.msg_storepath = this.rootDir+'/msgStore.json'
    this.last_commit_time = new Date().getTime();
    this.timeOut = 5;

    // Settings for GitDB
    this.VC = new subscribeVC(this.rootDir+'/gitDB');
    this.VC.init();
    
    // Mutex_Flag for Git
    this.flag = workerData.mutex_flag; // mutex flag

    // FirstCommit Extraction from PubVC
    this._reset_count(this.VC.returnFirstCommit(this.VC, this.pubvc_root));

    // Run gRPC Server
    this.ip = workerData.my_ip;
    this.my_port = workerData.my_portNum;
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
                this.target = message.data.end_point.ip + ':' + message.data.end_point.port;
                debug('[LOG] Target:' + this.target);
                // gRPC client creation
                this.grpc_client = new session_sync.SessionSync(this.target, grpc.credentials.createInsecure());
                this.session_desc = message.data.session_desc;
                this.sn_options = message.data.sn_options; // sync_interest_list, data_catalog_vocab, sync_time, sync_count, transfer_interface
                this.run(this);
                break;
            // Things to publsih
            case 'UPDATE_PUB_ASSET':
                this.count_msg += 1;
                this.prePublish(this, message.data);
                break;
        }
    });
}

/// Initiate Session
exports.Session.prototype._init = function(self) {
    const addr = self.ip+':'+self.my_port;
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
    content.commit_number.push(message.commit_number);
    self.__save_dict(content);
    if (self.count_msg >= self.sn_options.sync_desc.sync_count[0]) {
        debug("[LOG] Sync_count reached - clearTimeOout");
        clearTimeout(self.setTimeoutID);
        self.run(self);
    }
}

/// If the count / sync time reaches some point, extract the git diff and publish it to other session
exports.Session.prototype.onMaxCount = async function(self) {
    self.count_msg = 0;
    debug("[LOG] onMaxCount");
    // Read file first and reset the file
    const topublish = self.__read_dict();
    self._reset_count(topublish.commit_number[topublish.commit_number.length - 1]);
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
        for (var i = 0; i < this.sn_options.datamap_desc.sync_interest_list.length; i++) {
            diff_directories = diff_directories + ' ' + this.sn_options.datamap_desc.sync_interest_list[i];
        }
        var git_diff = execSync('cd ' + this.pubvc_root + ' && git diff --no-color ' + topublish.previous_last_commit + ' ' + topublish.commit_number[topublish.stored - 1] + diff_directories);
        this.flag[0] = 0;
        // mutex off
        return git_diff;
    }
}

/// Reset count after publish
// last_commit: string. commit # of last git commit
exports.Session.prototype._reset_count = function(last_commit) {
    this.count_msg = 0;
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    // 파일 초기화
    const content = {
        stored: 0,
        commit_number: [],
        previous_last_commit: lc
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
                  'git_patch': git_patch,
                  'receiver_id': this.session_desc.session_id};

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
    debug('[LOG] Server: ' + self.id + ' gRPC Received: to ' + call.request.receiver_id);
    // Only process the things when sender's id is the same one with the counter session's id
    if (call.request.receiver_id == self.id) {
        debug("[LOG] Git Patch Start");
        // git Patch apply
        var result = self.gitPatch(call.request.git_patch, self);
        // ACK Transimittion
        // If no problem, result is 0. Otherwise is not defined yet.
        callback(null, {transID: call.request.transID, result: result})
        // Producing the Kafka message and publish it.
        self.kafkaProducer(call.request.git_patch, self);
    }
}

// (2): Apply the git patch received through gRPC
exports.Session.prototype.gitPatch = function(git_patch, self) {
    // save git patch as a temporal file
    var temp = self.rootDir + "/" + Math.random().toString(10).slice(2,5) + '.patch';
    try {
        fs.writeFileSync(temp, git_patch);
    } catch (err) {
        debug("[ERROR] ", err);
        return 1;
    }
    self.VC.apply(temp);
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
                { topic: 'send.asset', messages:JSON.stringify(payload_list[i])}
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
    fs.writeFileSync(this.msg_storepath, contentJSON);
}

exports.Session.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msg_storepath.toString()));
}


exports.Session.prototype.run = function(self) {
    now = new Date().getTime();
    var condition_time = self.count_msg >= 1 && now - self.last_commit_time >= self.sn_options.sync_desc.sync_time[0];
    var condition_count = (self.count_msg >= self.sn_options.sync_desc.sync_count[0]);
    if (condition_time || condition_count) {
        // Sync_time 초과 시 강제 진행
        self.onMaxCount(self);
    }
    setTimeout(self.run, self.timeOut, self);
}
const ss = new session.Session();
