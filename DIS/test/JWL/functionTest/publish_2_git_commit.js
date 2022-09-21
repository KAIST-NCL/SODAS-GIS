// git commit 테스트
// VersionControl의 vcModule을 테스트해야한다.
// 방법: vcConsumer의 constructor 인자로 테스트용 클래스 전달
//       vcConsumer에서 Kafka 메시지 수신한 내용 출력
//       테스트용 클래스로 전달되온 파싱 내용 출력

const ConfigParser = require('configparser');
const { Worker, MessageChannel } = require("worker_threads");

const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
const mutex_flag = new Int8Array(sharedArrayBuffer);

class DHDaemon {
    constructor() {
        this.conf = new ConfigParser();
        this.conf.read(__dirname+'/../../../setting.cfg');
        this.pubvc_root = __dirname+'/pubvc';
        this.kafka = this.conf.get('Kafka', 'ip');
        this.kafka_options = this.conf.get('Kafka', 'options');
        this.rmsync_root_dir = __dirname+'/../../../rdf_files/reference-model/domain-version';
        this.RM = 'domainVersion00.rdf';
        this.msgChn = new MessageChannel();
    }

    init() {
        const vcParam = {'sm_port': this.msgChn.port1, 
                         'pubvc_root': this.pubvc_root, 
                         'rmsync_root_dir': this.rmsync_root_dir, 
                         'kafka': this.kafka, 
                         'kafka_options': this.kafka_options, 
                         'mutex_flag': mutex_flag, 
                         'commit_period': {'timeOut': 5,
                                           'period': 10}
                        };
        this.VC = new Worker('../../../VersionControl/vcModule.js', { workerData: vcParam, transferList: [this.msgChn.port1]});
    }

    _vcUpdateReferenceModel() {
        this.VC.postMessage({
            event: 'UPDATE_REFERENCE_MODEL',
            data: this.RM
        });
    };
}

const daemon = new DHDaemon();

daemon.init();

setTimeout(() => daemon._vcUpdateReferenceModel(), 1000);

process.on('SIGINT', () => {
    // daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    // daemon.stop();
    process.exit();
});

