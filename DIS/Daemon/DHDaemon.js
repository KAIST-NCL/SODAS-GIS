const tty = require('tty');
if (tty.isatty(process.stderr.fd)) {
    process.env.DEBUG_COLORS = 'true';
}
const debug = require('debug')('sodas:daemon\t\t|');
const dm = require('./daemon');

const daemon = new dm.DHDaemon();
daemon.init().then(() => {daemon.run();});

process.on('SIGINT', () => {
    daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    daemon.stop();
    process.exit();
});
