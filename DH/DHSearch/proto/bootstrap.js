// const grpc = require('grpc')
// const protoLoader = require('@grpc/proto-loader')
// const packageDefinition = protoLoader.loadSync('../proto/bootstrap.proto', {
//     keepCase: true,
//     longs: String,
//     enums: String,
//     defaults: true,
//     oneofs: true
// });
// const bootstrapProto = grpc.loadPackageDefinition(packageDefinition).bootstrap.BootstrapBroker;

const grpc = require('grpc');
const bootstrapProto = grpc.load(__dirname+'/bootstrap.proto').bootstrap.BootstrapBroker;

let bootstrap_client;

module.exports = {

    Init: function(ip){

        bootstrap_client = new bootstrapProto(ip, grpc.credentials.createInsecure());

    },

    SetSeedNode: function(seedNode){

        bootstrap_client.SetSeedNode(seedNode, (error, response) => {
            if (!error) {
                console.log('Send node info to bootstrap server');
                console.log(seedNode);
                console.log(response.message);
            } else {
                console.error(error);
            }
        });

    },

    GetSeedNodeList: function(seedNode){
        var list = [];
        async function getSeedNodeList() {

            let get = await bootstrap_client.GetSeedNodeList(seedNode, (error, response) => {
                if (!error) {
                    console.log('Receive seed node from bootstrap server');
                    list = JSON.parse(JSON.stringify( response.nodes ));
                } else {
                    console.error(error);
                }
            });
            await new Promise((resolve, reject) => setTimeout(resolve, 2000));

            return list
        }

        return getSeedNodeList().then((value) => value)
    },

    Close: function (){

        grpc.closeClient(bootstrap_client);
        console.log('gRPC session closed with bootstrap server');

    }

}
