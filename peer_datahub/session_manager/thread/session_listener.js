
const {parentPort} = require('worker_threads')

const grpc = require('grpc')
const sessionNegotiationProto = grpc.load('./proto/session_negotiation.proto')

const server = new grpc.Server()

server.addService(sessionNegotiationProto.session_negotiation.session_negotiation_broker.service, {
    request_session_negotiation: (call, callback) => {
        console.log("request_session_negotiation")
        var negotiationInfo = call.request
        console.log(negotiationInfo)
        sync_negotiation(negotiationInfo)
        callback(null, { status: true, negotiation_info: "" })
    },
    check_negotiation: (call, callback) => {
        console.log("check_negotiation")
        var result = call.request
        console.log(result)
        if (result.status) {
            parentPort.postMessage('');
        }
    }
})

parentPort.on('message', message => {
    server.bind(message, grpc.ServerCredentials.createInsecure())
    console.log('Session Request Server running at ' + message)
    server.start()
})

function sync_negotiation(negotiationInfo) {

}
