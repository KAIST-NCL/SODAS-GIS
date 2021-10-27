const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync(__dirname+'/bootstrap.proto', {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const bootstrapProto = grpc.loadPackageDefinition(packageDefinition).bootstrap.BootstrapBroker;

let bootstrap_client;

module.exports = {

    Init: function(ip){

        this.bootstrap_client = new bootstrapProto(ip, grpc.credentials.createInsecure());

    },

    SetSeedNode: function(seedNode){
        this.bootstrap_client.SetSeedNode(seedNode, (error, response) => {
            if (!error) {
                console.log('Send node info to bootstrap server');
                console.log(seedNode);
                console.log(response.message);
            } else {
                console.error(error);
            }
        });
    },

    GetSeedNode: function(seedNode){
        const promise = new Promise((resolve, reject) => this.bootstrap_client.GetSeedNodeList(seedNode, function(err, response) {
            if(err) {
                return reject(err)
            }
            resolve(response)
        }))
        return promise
    },

    Close: function (){

        grpc.closeClient(this.bootstrap_client);
        console.log('gRPC session closed with bootstrap server');

    }

}
