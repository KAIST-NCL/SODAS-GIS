
exports.checkNegotiationOptions = function(my_sn_options, other_sn_options){

    // todo: myOptions, otherOptions 비교 결과를 리턴하는 로직 구현
    console.log("[ * Check Session Negotiation * ]")
    let status;
    let sn_result = {};
    let datamap_desc_result = this._checkDatamapDesc(my_sn_options.datamap_desc, other_sn_options.datamap_desc)
    let sync_desc_result = this._checkSynchronizationDesc(my_sn_options.sync_desc, other_sn_options.sync_desc)

    if (datamap_desc_result.status && sync_desc_result.status) {
        sn_result.datamap_desc = datamap_desc_result.result;
        sn_result.sync_desc = sync_desc_result.result;
        status = true;
    } else {
        status = false;
    }

    return {status: status, result: sn_result}
};

exports._checkDatamapDesc = function (my_datamap_desc, other_datamap_desc){
    let status;
    let datamap_desc_result = {};
    let sync_interest_list_result = interestTopicDivider(my_datamap_desc.sync_interest_list).filter(x=> interestTopicDivider(other_datamap_desc.sync_interest_list).includes(x))
    console.log(sync_interest_list_result)
    let data_catalog_vocab_result = my_datamap_desc.data_catalog_vocab.filter(x=> other_datamap_desc.data_catalog_vocab.includes(x))

    if (!isEmptyArr(sync_interest_list_result) && !isEmptyArr(data_catalog_vocab_result)){
        datamap_desc_result.sync_interest_list = sync_interest_list_result;
        datamap_desc_result.data_catalog_vocab = data_catalog_vocab_result;
        status = true;
    } else {
        status = false;
    }

    return {status: status, result: datamap_desc_result}
}

exports._checkSynchronizationDesc = function (my_sync_desc, other_sync_desc){
    let status;
    let sync_desc_result = {};
    let sync_time_result = rangeToInteger(my_sync_desc.sync_time).filter(x=> rangeToInteger(other_sync_desc.sync_time).includes(x));
    let sync_count_result = rangeToInteger(my_sync_desc.sync_count).filter(x=> rangeToInteger(other_sync_desc.sync_count).includes(x));
    let transfer_interface_result = my_sync_desc.transfer_interface.filter(x=> other_sync_desc.transfer_interface.includes(x))

    if (!isEmptyArr(sync_time_result) && !isEmptyArr(sync_count_result) && !isEmptyArr(transfer_interface_result)){
        sync_desc_result.sync_time = sync_time_result;
        sync_desc_result.sync_count = sync_count_result;
        sync_desc_result.transfer_interface = transfer_interface_result;
        status = true;
    } else {
        status = false;
    }

    return {status: status, result: sync_desc_result};
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

function interestTopicDivider (arr) {
    var divider = [];
    for (let i = 0; i < arr.length; i++) {
        divider = divider.concat(arr[i].split("/")[0])
    }
    return [...new Set(divider)]
}

// function interestTopicDivider (arr) {
//     var divider = [];
//     for (let i = 0; i < arr.length; i++) {
//         var temp_divider = arr[i].split("/");
//         for (let j = 0; j < temp_divider.length; j++) {
//             if (j == 0) {
//             }
//             else{
//                 temp_divider[j] = temp_divider[j-1] + "/" + temp_divider[j]
//             }
//         }
//         divider = divider.concat(temp_divider)
//     }
//     return [...new Set(divider)]
// }