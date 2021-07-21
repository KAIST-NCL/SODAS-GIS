
const {parentPort} = require('worker_threads')

parentPort.on('message', message => {
    console.log('worker2 received message: %o', message)
})

function grpc_init(){
    const grpc = require('grpc');
    const sessionNegotiationProto = grpc.load('./proto/session_negotiation.proto').session_negotiation.session_negotiation_broker;

    let session_negotiation_client;

    session_negotiation_client = new sessionNegotiationProto("127.0.0.1:9000", grpc.credentials.createInsecure());
}
