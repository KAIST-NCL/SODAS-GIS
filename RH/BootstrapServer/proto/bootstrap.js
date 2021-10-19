const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader')
const packageDefinition = protoLoader.loadSync(__dirname+'/bootstrap.proto', {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const bootstrapProto = grpc.loadPackageDefinition(packageDefinition);

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
                callback(null, {nodes: seedNodeList})
                seedNodeList.unshift(seedNode)
                console.log(seedNodeList)
            }
        })

        server.bindAsync(ip, grpc.ServerCredentials.createInsecure(), () => {
            console.log('[RH] Bootstrap gRPC Server running at ' + ip)
            server.start();
        });
    }
}
