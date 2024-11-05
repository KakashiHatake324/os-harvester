import bunyan, { LogLevel, Stream } from "bunyan";
import bunyanFormat from "bunyan-format";
const formatOut = bunyanFormat({ outputMode: "short" }); // Options: 'short', 'long', 'simple', 'json', 'bunyan'

const loggerConfig = {
  name: "osHarvester",
  level: "info" as LogLevel,
  streams: [
    {
      level: "info" as LogLevel,
      stream: formatOut,
    },
  ] as Stream[],
  serializers: {
    err: bunyan.stdSerializers.err,
  },
};

export const logger = bunyan.createLogger(loggerConfig);