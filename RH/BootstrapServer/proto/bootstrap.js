// const grpc = require('grpc')
// const protoLoader = require('@grpc/proto-loader')
// const packageDefinition = protoLoader.loadSync('./proto/bootstrap.proto', {
//     keepCase: true,
//     longs: String,
//     enums: String,
//     defaults: true,
//     oneofs: true
// });
// const bootstrapProto = grpc.loadPackageDefinition(packageDefinition);

const grpc = require('grpc')
const bootstrapProto = grpc.load('./proto/bootstrap.proto')

const server = new grpc.Server()
const seedNodeList = []
let seedNode;

module.exports = {

    seedNodeList: seedNodeList,

    bootstrapProtoServerInit: function (ip) {

        server.addService(bootstrapProto.bootstrap.BootstrapBroker.service, {
            SetSeedNode: (call, callback) => {
                console.log("SetSeedNode")
                seedNode = call.request
                console.log(seedNode)
                seedNodeList.unshift(seedNode)
                console.log(seedNodeList)
                callback(null, { status: true, message: "Success enroll node info" })
            },
            GetSeedNodeList: (call, callback) => {
                console.log("GetSeedNodeList")
                seedNode = call.request
                console.log(seedNode)
                callback(null, seedNodeList)
                seedNodeList.unshift(seedNode)
                console.log(seedNodeList)
            }
        })

        server.bind(ip, grpc.ServerCredentials.createInsecure())
        console.log('Server running at ' + ip)
        server.start()

    }
}
