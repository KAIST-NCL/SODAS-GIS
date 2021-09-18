module.exports = class Logger {
    constructor(messages = ["Default1", "Default2", "Default3"], c_time = 1000) {
        this.messages = messages
        this.c_time = c_time
    }

    stop(sig = 'Unknown'){
        console.log("\nSYSTEM TERMINATED :", sig)
    }

    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        })
    }

    async main(){
        let i = 0
        while (1){
            // console.log(this.messages[i%3])
            let now = new Date()
            console.log(now)
            i += 1
            await this.sleep(this.c_time)
        }
    }
}