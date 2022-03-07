const diff_parser = require('./diff_parser.js');

// parse git diff (git patch) to extract filepaths, related information

exports.get_file_path = function(str) {
    // diff --git a/filepath b/filepath
    var last_part = str.split(' ')[3];

    var dir = last_part.substring(2);
    return dir;
}

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
