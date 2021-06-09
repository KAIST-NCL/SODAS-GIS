const crypto = require('crypto');
const { networkInterfaces } = require('os');

module.exports = {

    nodeInfoInit: function (port) {

        const nets = networkInterfaces();
        const results = Object.create(null);

        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {

                if (net.family === 'IPv4' && !net.internal) {
                    if (!results[name]) {
                        results[name] = [];
                    }
                    results[name].push(net.address);
                }
            }
        }

        let seedNode = {
            nodeId: null,
            address: null,
            port: port
        };

        seedNode.address = results["en0"][0];
        seedNode.nodeId = crypto.createHash('sha1').update(seedNode.address, seedNode.port).digest('hex');

        console.log(seedNode);

        return seedNode;

    }

};
