import * as winston from "winston";

const env = process.env.NODE_ENV || "production";

let level;
switch (env) {
    case "debug":
        level = "debug";
        break;
    case "test":
        level = "crit";
        break;
    default:
        level = "info";
}

// Formats the logged message to single line
const myPrettyPrint = (obj: {}) => {
    return JSON.stringify(obj, null, 2).replace(/(?:\r\n|\r|\n)/g, "");
};
// Format date on every log line
const tsFormat = () => (new Date()).toISOString();

const transports = [
    new (winston.transports.Console)({
        colorize: true,
        level,
        prettyPrint: myPrettyPrint,
        timestamp: tsFormat(),
    }),
];

const logger = new (winston.Logger)({transports});

export default logger;
