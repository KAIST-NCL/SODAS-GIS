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
        this.conf.read(__dirname+'/../../setting.cfg');
        this.rmgit_dir = __dirname+'/reference_files_dir';
        this.kafka = this.conf.get('Kafka', 'ip');
        this.kafka_options = this.conf.get('Kafka', 'options');
        this.msgChn = new MessageChannel();
    }

    init() {
        const vcParam = {'sm_port': this.msgChn.port1, 
                         'rmgit_dir': this.rmgit_dir,  
                         'kafka': this.kafka, 
                         'kafka_options': this.kafka_options, 
                         'mutex_flag': mutex_flag, 
                         'commit_period': {'timeOut': 5,
                                           'period': 10}
                        };
        this.VC = new Worker(__dirname+'/../../VersionControl/vcModule.js', { workerData: vcParam, transferList: [this.msgChn.port1]});
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

// setTimeout(() => daemon._vcUpdateReferenceModel(), 1000);

process.on('SIGINT', () => {
    // daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    // daemon.stop();
    process.exit();
});

