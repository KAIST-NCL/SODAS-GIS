const KBucket = require('k-bucket')

const kBucket1 = new KBucket({
    localNodeId: Buffer.from('my node id') // default: random data
})
// or without using Buffer (for example, in the browser)
const id = 'my node id'
const nodeId = new Uint8Array(id.length)
for (let i = 0, len = nodeId.length; i < len; ++i) {
    nodeId[i] = id.charCodeAt(i)
}
const kBucket2 = new KBucket({
    localNodeId: nodeId // default: random data
})
const kBucket3 = new KBucket({
    localNodeId: Buffer.from('my node id')
})
console.log(kBucket1.localNodeId.toString())
console.log(kBucket2.localNodeId.toString())
console.log(kBucket3.localNodeId.toString())
console.log("---------------------------------------")

const contact1 = {
    id: Buffer.from('workerService'),
    workerNodes: {
        '17asdaf7effa2': { host: '127.0.0.1', port: 1337 },
        '17djsyqeryasu': { host: '127.0.0.1', port: 1338 }
    }
};

const contact2 = {
    id: Buffer.from('workerService2'),
    workerNodes: {
        '17asdaf7effa2': { host: '127.0.0.1', port: 1337 },
        '17djsyqeryasu': { host: '127.0.0.3', port: 4444 }
    }
};

function arbiter(incumbent, candidate) {
    // we create a new object so that our selection is guaranteed to replace
    // the incumbent
    const merged = {
        id: incumbent.id, // incumbent.id === candidate.id within an arbiter
        workerNodes: incumbent.workerNodes
    }

    Object.keys(candidate.workerNodes).forEach(workerNodeId => {
        merged.workerNodes[workerNodeId] = candidate.workerNodes[workerNodeId];
    })

    return merged
}

contact3 = arbiter(contact1, contact2)

console.log(contact1)
console.log(contact2)
console.log(contact3)
console.log("---------------------------------------")

kBucket1.add(contact1)
kBucket1.add(contact2)
console.log(kBucket1)
console.log(kBucket1.root.contacts)
console.log(kBucket1.count())
console.log(kBucket1.get(Buffer.from('workerService2')))

console.log(contact1.workerNodes)
