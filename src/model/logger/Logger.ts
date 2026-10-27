import winston from "winston";

const env = process.env.NODE_ENV || "production";

const level = env === "debug" ? "debug" : "info";

// Single line: "<ISO timestamp> - <level>: <message>" (same shape as the winston 2 console output)
const lineFormat = winston.format.printf(({timestamp, level: lvl, message, stack}) => {
    const text = typeof message === "string" ? message : JSON.stringify(message);
    return `${timestamp} - ${lvl}: ${stack ?? text}`.replace(/(?:\r\n|\r|\n)/g, " ");
});

const formats = [
    winston.format.errors({stack: true}),
    winston.format.timestamp(),
];
if (process.stdout.isTTY) {
    formats.push(winston.format.colorize());
}
formats.push(lineFormat);

const logger = winston.createLogger({
    level,
    silent: env === "test",
    format: winston.format.combine(...formats),
    transports: [new winston.transports.Console()],
});

export default logger;
