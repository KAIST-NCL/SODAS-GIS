
const dh = require('../api/dhnode');
const bootstrap = require('../proto/bootstrap');

const bootstrapServerIP = '127.0.0.1:50051';
const desc = {
    port: 8080
};
var dhNode = new dh.DHNode(desc);
const seedNode = dhNode.init_nodeInfo(desc.port);

async function bootstrap_process() {

    let bootstrap_client = await bootstrap.init(bootstrapServerIP);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    // let set = await bootstrap.set_seed_node(seedNode);
    // await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let get = await bootstrap.get_seed_node_list(seedNode);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let close = await bootstrap.close()

    return null;
}

bootstrap_process()
