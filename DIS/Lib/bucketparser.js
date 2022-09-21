

exports.nodeIDSearcher = function(bucketLists, nodeIDs) {
    var selectedBucketList = {};

    var searchList = [];
    nodeIDs.forEach(element => {
        searchList.push(element);
    })
    
    for (const [key, value] of Object.entries(bucketLists)) {
        // key: 거리를 나타내는 카뎀리아 결과
        // value._contacts: node 정보가 담긴 Array
        // value에서 원하는 nodeID가 검색될 경우 key와 함께 저장
        if (searchList.length == 0) break;
        const bucketArray = value._contacts;
        for (const bucket of bucketArray) {
            if (searchList.length == 0) break;
            index = searchList.indexOf(bucket.nodeID);
            if (index != -1) {
                searchList.splice(index, 1);
                selectedBucketList[key] = {_contacts: []};
                selectedBucketList[key]._contacts.push(bucket);
            }
        }
    }
    
    if(searchList.lengh != 0) {
        // 몇 개의 node가 검색되지 않은 경우이다.
    }

    return selectedBucketList;
}