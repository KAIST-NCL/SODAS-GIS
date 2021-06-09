// const grpc = require('grpc')
// const protoLoader = require('@grpc/proto-loader')
// const packageDefinition = protoLoader.loadSync('../proto/bootstrap.proto', {
//     keepCase: true,
//     longs: String,
//     enums: String,
//     defaults: true,
//     oneofs: true
// });
// const bootstrapProto = grpc.loadPackageDefinition(packageDefinition).bootstrap.bootstrap_broker;

const grpc = require('grpc');
const bootstrapProto = grpc.load('../proto/bootstrap.proto').bootstrap.bootstrap_broker;

let bootstrap_client;

module.exports = {

    init: function(ip){

        bootstrap_client = new bootstrapProto(ip, grpc.credentials.createInsecure());

    },

    set_seed_node: function(seedNode){

        bootstrap_client.set_seed_node(seedNode, (error, response) => {
            if (!error) {
                console.log('Send node info to bootstrap server');
                console.log(seedNode);
                console.log(response.message);
            } else {
                console.error(error);
            }
        });

    },

    get_seed_node_list: function(){

        bootstrap_client.get_seed_node_list({}, (error, response) => {
            if (!error) {
                console.log('Receive seed node from bootstrap server');
                console.log(response.nodes);
            } else {
                console.error(error);
            }
        });

    },

    close: function (){

        grpc.closeClient(bootstrap_client);
        console.log('gRPC session closed with bootstrap server');

    }

}
