var exports = module.exports = {};

exports.arbiter = function(incumbent, candidate) {
    const merged = {
        id: incumbent.id, // incumbent.id === candidate.id within an arbiter
        workerNodes: incumbent.workerNodes
    }

    Object.keys(candidate.workerNodes).forEach(workerNodeId => {
        merged.workerNodes[workerNodeId] = candidate.workerNodes[workerNodeId];
    })

    return merged
}

exports.contactToString = function(contact) {
    console.log("")
    contact.id = contact.id.toString();
    console.log(contact)
    contact.id = Buffer.from(contact.id)
    console.log("")
}
