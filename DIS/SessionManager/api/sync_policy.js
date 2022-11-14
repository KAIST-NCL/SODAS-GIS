
exports.checkNegotiationOptions = function(my_sn_options, other_sn_options){

    // todo: myOptions, otherOptions 비교 결과를 리턴하는 로직 구현
    console.log("[ * Check Session Negotiation * ]")
    let status;
    let snResult = {};
    let datamapDescResult = this._checkDatamapDesc(my_sn_options.datamapDesc, other_sn_options.datamapDesc)
    let syncDescResult = this._checkSynchronizationDesc(my_sn_options.syncDesc, other_sn_options.syncDesc)

    if (datamapDescResult.status && syncDescResult.status) {
        snResult.datamapDesc = datamapDescResult.result;
        snResult.syncDesc = syncDescResult.result;
        status = true;
    } else {
        status = false;
    }

    return {status: status, result: snResult}
};

exports._checkDatamapDesc = function (my_datamap_desc, other_datamap_desc){
    let status;
    let datamapDescResult = {};
    let syncInterestListResult = interestTopicIntersection(my_datamap_desc.syncInterestList, other_datamap_desc.syncInterestList);
    console.log(syncInterestListResult)
    let dataCatalogVocabResult = my_datamap_desc.dataCatalogVocab.filter(x=> other_datamap_desc.dataCatalogVocab.includes(x))

    if (!isEmptyArr(syncInterestListResult) && !isEmptyArr(dataCatalogVocabResult)){
        datamapDescResult.syncInterestList = syncInterestListResult;
        datamapDescResult.dataCatalogVocab = dataCatalogVocabResult;
        status = true;
    } else {
        status = false;
    }

    return {status: status, result: datamapDescResult}
}

exports._checkSynchronizationDesc = function (my_sync_desc, other_sync_desc){
    let status;
    let syncDescResult = {};
    let syncTimeResult = rangeToInteger(my_sync_desc.syncTime).filter(x=> rangeToInteger(other_sync_desc.syncTime).includes(x));
    let syncCountResult = rangeToInteger(my_sync_desc.syncCount).filter(x=> rangeToInteger(other_sync_desc.syncCount).includes(x));
    let transferInterfaceResult = my_sync_desc.transferInterface.filter(x=> other_sync_desc.transferInterface.includes(x))

    if (!isEmptyArr(syncTimeResult) && !isEmptyArr(syncCountResult) && !isEmptyArr(transferInterfaceResult)){
        syncDescResult.syncTime = syncTimeResult;
        syncDescResult.syncCount = syncCountResult;
        syncDescResult.transferInterface = transferInterfaceResult;
        status = true;
    } else {
        status = false;
    }

    return {status: status, result: syncDescResult};
}

function isEmptyArr (arr)  {
    return Array.isArray(arr) && arr.length === 0;
}

function rangeToInteger (arr)  {
    let temp = [];
    for (let start = arr[0]; start < arr[1]+1; start++){
        temp.push(start);
    }
    return temp;
}

function interestTopicIntersection (arr1, arr2) {
    const intersection = [];
    for (let i = 0; i < arr1.length; i++) {
        for (let j = 0; j < arr2.length; j++) {
            if (arr1[i].includes(arr2[j])) {
                intersection.push(arr1[i])
            } else if (arr2[j].includes(arr1[i])) {
                intersection.push(arr2[j])
            } else {

            }
        }
    }
    return [...new Set(intersection)]
}
