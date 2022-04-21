const { Worker } = require("worker_threads");
const rmSyncParam = {'dm_ip': '127.0.0.1', 'rm_port': 50069, 'rh_ip': '127.0.0.1', 'rh_portNum': 50050, 'rmsync_root_dir': __dirname};

const rmSync = new Worker('./rmSync.js', { workerData: rmSyncParam });

console.log('DHDaemon thread is running')

rmSync.on('message', message => {
    switch (message.event) {
        // S-Worker 초기화 event
        case 'UPDATE_REFERENCE_MODEL':
            console.log('DHDaemon thread receive [UPDATE_REFERENCE_MODEL] event from RMSync')
            console.log(message.data)
    }
});
async function process() {
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));
    await console.log('DHDaemon thread send [INIT] event to RMSync')
    await rmSync.postMessage({event: 'INIT', data: null})
}

process();