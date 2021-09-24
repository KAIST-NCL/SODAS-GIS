// !/usr/bin/forever

// const ChildProcess = require('child_process')
const Logger = require("./Logger")

// const ArgumentParser = require('argparse')
// const parser = new ArgumentParser()

// Parser 부분 여기다가 구현할 것
// parser.add_argument("--pid", help="pid filename", required=True)
// parser.add_argument("--log", help="log filename", required=False)
// console.log( process.argv[2] )

// Double fork - first fork 구현하기
// pid = ChildProcess.spawn()

logger = new Logger(["JY1","JY2","JY3"], 1000)
logger.main();

process.on('SIGINT', () => {
    logger.stop('SIGINT')
    process.exit()
})
process.on('SIGTERM', () => {
    logger.stop('SIGTERM')
    process.exit()
})

