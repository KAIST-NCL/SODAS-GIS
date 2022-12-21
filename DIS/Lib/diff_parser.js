const diff_parser = require('./diff_parser.js');

/**
 * git diff 추출물 내에서 파일 경로를 파싱하여 가져오는 함수
 * @param {string} str - 파싱 대상이 되는 문자열
 * @returns - 파일 경로
 */
exports.get_file_path = function(str) {
    // diff --git a/filepath b/filepath
    var last_part = str.split(' ')[3];

    var dir = last_part.substring(2);
    return dir;
}

/**
 * filepath에 해당하는 related 정보를 반환하는 함수
 * @param {string} dir 
 * @returns - 주어진 경로에 해당하는 related 정보
 */
exports.file_path_to_related = function(dir) {
    // domain/taxonomy/category/.../asset_id.asset

    var strArray = dir.split('/');

    var strArrayLength = strArray.length;

    var related = [];

    var domain = strArray[0];
    related.push({operation: "UPDATE", id: domain, "type": "domain"});
    var taxonomy = strArray[1];
    related.push({operation: "UPDATE", id: taxonomy, "type": "taxonomy"});

    for (i = 2; i < strArrayLength - 1; i++) {
        var category = strArray[i];
        related.push({operation: "UPDATE", id: category, "type": "category"});
    }

    return related;
}

/**
 * git diff 추출물을 파싱하여 patch 대상인 파일 경로 목록 반환하는 함수
 * @param {string} git_patch 
 * @returns - patch 대상인 파일 경로 목록
 */
exports.parse_git_patch = function(git_patch) {
    var linesArray = git_patch.split('\n');

    var file_path_list = [];

    linesArray.forEach((line) => {
        if (line.indexOf('diff --git a/') >= 0) {
            file_path_list.push(diff_parser.get_file_path(line));
        }
    });

    return file_path_list;
}

/**
 * 주어진 파일 경로가 DIS의 interest에 속하는 지 확인하는 함수
 * @param {string} filepath - 파일 경로
 * @param {Array} interests - DIS의 Interest 목록
 * @returns 
 */
exports.isInInterest = function(filepath, interests) {
    var is = false;
    // interests = ['path1', 'path2', ...]
    interests.forEach((interest) => {
        if (filepath.indexOf(interest) == 1) {
            is = true;
            return false;
        }
    })
    return is;
}

/**
 * patch 대상에서 interest에 해당하는 것만 남기는 함수
 * @param {string} git_patch 
 * @param {string} interests - DIS의 interest 목록
 * @returns - interest에 해당하지 않는 내용이 삭제된 git diff 추출물
 */
exports.prune_git_patch = function(git_patch, interests) {
    var linesArray = git_patch.split('\n');
    var new_git_patch = '';

    var write = false;
    
    linesArray.forEach((line) => {
       if (line.indexOf('diff --git a/') >= 0) {
           var filepath = diff_parser.get_file_path(line);
           // 파일 경로가 interest에 속한다면
           if(git_diff.isInInterest(filepath, interests)) {
                write   = true;
           }
           else {
                write = false;
           }
       }

       if(write) {
           new_git_patch = new_git_patch + line + '\n';
       }
    });

    return new_git_patch;
}
