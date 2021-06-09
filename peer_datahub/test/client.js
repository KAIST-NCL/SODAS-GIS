
const node_utils = require('../api/node_utils');
const bootstrap = require('../proto/bootstrap');

const bootstrapServerIP = '127.0.0.1:50051';
const seedNode = node_utils.nodeInfoInit(8080);

async function bootstrap_process() {

    let bootstrap_client = await bootstrap.init(bootstrapServerIP);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let set = await bootstrap.set_seed_node(seedNode);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let get = await bootstrap.get_seed_node_list();
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let close = await bootstrap.close()

    return null;
}

bootstrap_process()
